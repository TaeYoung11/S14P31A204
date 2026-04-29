"""
services/llm3d/query — IFC 공간 인접성 및 검색 고도화 패키지
"""
from .adjacency import AdjacencyCandidate, AdjacencyResult, AdjacencyQueryEngine
 
__all__ = [
    "AdjacencyCandidate",
    "AdjacencyResult",
    "AdjacencyQueryEngine",
]