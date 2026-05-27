# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## WebSocket IFC URL handling (FE)

FE는 WebSocket 메시지에서 받은 IFC URL을 다음 규칙으로 해석해 로딩합니다.

| WS 수신 URL 포맷 | FE 동작 | 로딩 URL 예시 |
| --- | --- | --- |
| `https://...` 또는 `http://...` | 그대로 fetch | `https://cdn.example.com/projects/p1/model.ifc` |
| `s3://...` 또는 storage path | 현재 미지원(오류 처리) | - |
| `projects/.../model.ifc` 같은 relative path | API origin 기준 절대 URL로 변환 | `http://localhost:8080/projects/.../model.ifc` |

### Setup steps

1. FE dev 서버를 재시작합니다 (`npm run dev` 다시 실행).
2. WebSocket 이벤트 수신 후 `https://...` 또는 relative URL만 내려오는지 확인합니다.

주의:
- `s3://...`는 현재 FE에서 지원하지 않습니다.
- WS에서 `s3://...`를 내려주면 로딩이 실패합니다.

### FE-only verification (without BE implementation)

아래는 BE 미구현 상태에서도 FE 로직 자체를 검증하는 방법입니다.

1. 런타임 디버그로 실제 수신값/변환값 확인
```env
VITE_IFC_URL_DEBUG=true
```
- WS 수신 원본 URL 저장: `localStorage['ifc-last-ws-url']`
- FE 변환(fetch) URL 저장: `localStorage['ifc-last-fetch-url']`
- 콘솔 로그:
  - `[ifc-url][ws]`
  - `[ifc-url][resolved]`

문제 해결:
- `Failed to load resource: net::ERR_NAME_NOT_RESOLVED`가 뜨면 도메인 DNS 실패입니다.
- WS payload URL이 `s3://...` 형식이면 현재 구현에서는 오류가 발생합니다.
