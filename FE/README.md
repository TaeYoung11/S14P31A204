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
| `s3://bucket/key.ifc` | `VITE_STORAGE_HTTP_BASE_URL` + `/bucket/key.ifc` 로 변환 | `https://cdn.your-domain.com/bucket/key.ifc` |
| `projects/.../model.ifc` 같은 relative path | `VITE_STORAGE_HTTP_BASE_URL`가 있으면 base에 붙임, 없으면 API origin 기준으로 변환 | `https://cdn.your-domain.com/projects/.../model.ifc` |

### Required env

`.env.local` 파일에 아래 값을 설정하세요.

```env
VITE_STORAGE_HTTP_BASE_URL=https://cdn.your-domain.com
```

예:
- WS 수신값: `s3://bucket/key.ifc`
- FE 변환값: `https://cdn.your-domain.com/bucket/key.ifc`

### Setup steps

1. CDN/프록시에서 IFC 파일이 HTTPS로 열리도록 준비합니다.
2. `FE/.env.local`에 `VITE_STORAGE_HTTP_BASE_URL`를 설정합니다.
3. FE dev 서버를 재시작합니다 (`npm run dev` 다시 실행).
4. 브라우저에서 변환된 URL이 직접 열리는지 확인합니다.

주의:
- `VITE_STORAGE_HTTP_BASE_URL`에는 끝 `/`를 넣어도 동작하지만, 보통 없이 쓰는 것을 권장합니다.
- 브라우저에서 열 수 없는 내부 S3 URL만 내려오면 FE 단독으로는 로딩할 수 없습니다.

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
- `.env.local`의 `VITE_STORAGE_HTTP_BASE_URL=https://cdn.your-domain.com`는 예시값이라 그대로 쓰면 실패할 수 있습니다.

3. `VITE_STORAGE_HTTP_BASE_URL`를 제거해도 되는 조건
- WS가 항상 `https://...`(또는 FE에서 바로 접근 가능한 relative URL)만 내려주면 제거 가능
- WS에 `s3://...`가 올 수 있으면 제거하면 안 됨
  - 이 경우 FE는 의도적으로 에러를 발생시켜(`VITE_STORAGE_HTTP_BASE_URL` 필요) 잘못된 로딩을 막습니다.
