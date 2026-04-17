from typing import List, Dict
from datetime import datetime

class DiffService:
    @staticmethod
    def calculate_delta(project_id: str, changes: List[Dict]) -> Dict:
        """
        BIMService에서 넘어온 원시 변경 사항 리스트를 
        WebSocket 전송용 표준 Delta JSON 형식으로 변환합니다.
        """
        return {
            "type": "model_update",
            "project_id": project_id,
            "timestamp": datetime.utcnow().isoformat(),
            "changes": changes
        }

    @staticmethod
    def format_processing_status(status: str, message: str) -> Dict:
        """처리 중 상태 메시지 포맷팅"""
        return {
            "type": "processing",
            "status": status,
            "message": message
        }

    @staticmethod
    def format_error(code: str, message: str) -> Dict:
        """오류 메시지 포맷팅"""
        return {
            "type": "error",
            "code": code,
            "message": message
        }
