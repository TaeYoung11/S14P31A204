import { Link } from 'react-router-dom'

// 정의되지 않은 경로 접근 시 표시되는 404 페이지
export default function NotFoundPage() {
  return (
    <div style={{ textAlign: 'center', marginTop: '4rem' }}>
      <h1>404</h1>
      <p>페이지를 찾을 수 없습니다.</p>
      <Link to="/">홈으로 돌아가기</Link>
    </div>
  )
}
