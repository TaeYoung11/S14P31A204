import uuid
import math
import json
from typing import Optional, List, Dict
from datetime import datetime
from app.models.floor_models import (
    FloorProject, Room, SimulationRequest, SimulationResult,
    ExportRequest, FloorNLPCommand
)

class FloorService:
    def create_project(self, name: str) -> FloorProject:
        """빈 프로젝트 생성"""
        return FloorProject(
            id=str(uuid.uuid4()),
            name=name,
            rooms=[],
            adjacency=[],
            boundaries=[],
            created_at=datetime.utcnow().isoformat()
        )

    def run_simulation(self, project: FloorProject, request: SimulationRequest) -> SimulationResult:
        """
        Force-Directed 시뮬레이션 (Python 구현).
        locked=True인 방은 위치를 고정한다.
        프론트엔드 D3 force와 최대한 유사한 파라미터를 사용한다.
        """
        if not project.rooms:
            return SimulationResult(
                project_id=project.id,
                rooms=[],
                energy=0.0,
                converged=True
            )

        rooms_dict = {r.id: r for r in project.rooms}
        # 초기 좌표 설정 (없으면 0,0)
        positions = {
            r.id: [r.x if r.x is not None else 0.0, r.y if r.y is not None else 0.0]
            for r in project.rooms
        }
        velocities = {r.id: [0.0, 0.0] for r in project.rooms}

        alpha = 1.0
        alpha_target = 0.0
        alpha_decay = request.alpha_decay

        for _ in range(request.iterations):
            alpha += (alpha_target - alpha) * alpha_decay

            # 1. 링크 힘 (인접도 스프링)
            for entry in project.adjacency:
                if entry.from_room_id not in positions or entry.to_room_id not in positions:
                    continue
                
                a_pos = positions[entry.from_room_id]
                b_pos = positions[entry.to_room_id]
                dx = b_pos[0] - a_pos[0]
                dy = b_pos[1] - a_pos[1]
                dist = math.sqrt(dx*dx + dy*dy) or 0.1
                
                target_dist = 5.0  # 기본 목표 거리 (5미터)
                # D3-like spring force: (dist - target) * alpha * strength
                force = (dist - target_dist) / dist * alpha * entry.strength
                
                if not rooms_dict[entry.from_room_id].locked:
                    velocities[entry.from_room_id][0] += dx * force
                    velocities[entry.from_room_id][1] += dy * force
                if not rooms_dict[entry.to_room_id].locked:
                    velocities[entry.to_room_id][0] -= dx * force
                    velocities[entry.to_room_id][1] -= dy * force

            # 2. 충돌 반발력 (방 겹침 방지)
            room_list = list(project.rooms)
            for i in range(len(room_list)):
                for j in range(i + 1, len(room_list)):
                    ri = room_list[i]
                    rj = room_list[j]
                    
                    # 같은 층일 때만 충돌 계산
                    if ri.floor != rj.floor:
                        continue
                        
                    pi = positions[ri.id]
                    pj = positions[rj.id]
                    dx = pj[0] - pi[0]
                    dy = pj[1] - pi[1]
                    dist = math.sqrt(dx*dx + dy*dy) or 0.1
                    
                    # 반지름을 w/h 중 큰 값의 절반 + 여유공간 1m로 계산
                    ri_radius = max(ri.width, ri.height) / 2
                    rj_radius = max(rj.width, rj.height) / 2
                    min_dist = ri_radius + rj_radius + 1.0
                    
                    if dist < min_dist:
                        force = (min_dist - dist) / dist * alpha * 0.5
                        if not ri.locked:
                            velocities[ri.id][0] -= dx * force
                            velocities[ri.id][1] -= dy * force
                        if not rj.locked:
                            velocities[rj.id][0] += dx * force
                            velocities[rj.id][1] += dy * force

            # 3. 위치 업데이트 및 감쇠
            for r_id in positions:
                if not rooms_dict[r_id].locked:
                    positions[r_id][0] += velocities[r_id][0]
                    positions[r_id][1] += velocities[r_id][1]
                    # 속도 감쇠 (D3 friction 느낌)
                    velocities[r_id][0] *= 0.6
                    velocities[r_id][1] *= 0.6

        # 에너지 계산 (수렴도 지표: 속도의 제곱합)
        energy = sum(vx*vx + vy*vy for vx, vy in velocities.values())

        updated_rooms = []
        for r in project.rooms:
            updated = r.model_copy(update={
                "x": round(positions[r.id][0], 3),
                "y": round(positions[r.id][1], 3)
            })
            updated_rooms.append(updated)

        return SimulationResult(
            project_id=project.id,
            rooms=updated_rooms,
            energy=round(energy, 6),
            converged=energy < 0.01
        )

    def export_to_json(self, project: FloorProject, include_floors: List[int]) -> Dict:
        """Rhino/Grasshopper 호환 가능하도록 JSON 내보내기"""
        filtered_rooms = [r for r in project.rooms if r.floor in include_floors]
        filtered_adj = [
            a for a in project.adjacency 
            if any(r.id == a.from_room_id for r in filtered_rooms) and 
               any(r.id == a.to_room_id for r in filtered_rooms)
        ]
        filtered_bounds = [b for b in project.boundaries if b.floor in include_floors]

        return {
            "schema": "floor_planner_v1",
            "project_id": project.id,
            "project_name": project.name,
            "exported_at": datetime.utcnow().isoformat(),
            "rooms": [r.model_dump() for r in filtered_rooms],
            "adjacency": [a.model_dump() for a in filtered_adj],
            "boundaries": [b.model_dump() for b in filtered_bounds]
        }

    def export_to_ifc(self, project: FloorProject, include_floors: List[int]) -> bytes:
        """
        IFC 2x3 내보내기 (기초 구현).
        각 Room 을 IfcSpace 로 변환한다.
        현재는 기초적인 구조만 형성하며 실제 지오메트리는 추후 고도화 필요.
        """
        # TODO: ifcopenshell 을 사용한 실제 내보내기 구현
        # 현재는 Not Implemented 에러를 던지거나 최소한의 스텁 데이트를 반환
        # return b"IFC DATA STUB"
        raise NotImplementedError("IFC export functionality is planned for Phase 4.")
