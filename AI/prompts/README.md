# Prompts 안내

prompt 관리 서비스가 도입되기 전까지 prompt 자산은 이 디렉터리에서
repository 파일로 관리합니다.

`tasks/{group}/{task}/{version}/schema.json` 아래의 task prompt schema는
BE-AI 계약이나 워커 간 공유 계약으로 승격되기 전까지 해당 prompt 버전에
속한 local schema로 봅니다. 공유 계약은 `../../shared/schemas`에 둡니다.
