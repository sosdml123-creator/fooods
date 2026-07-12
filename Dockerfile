# 1. Base Image 설정 (Node.js LTS - Light weight Alpine)
FROM node:20-alpine AS builder

# 작업 디렉토리 지정
WORKDIR /app

# 루트 디펜던시 복사 및 설치
COPY package*.json ./
RUN npm ci

# 프론트엔드 디펜던시 복사 및 설치
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend

# 전체 소스 코드 복사
COPY . .

# Vite 프론트엔드 프로덕션 빌드 실행 (Vite 컴파일 결과물이 backend/www에 생성됨)
RUN npm run build

# 2. Production 전용 가벼운 실행 이미지로 분리
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Builder 스테이지에서 필요한 자산들만 카피
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend

# 8080 포트 노출 (Cloud Run 표준 포트)
EXPOSE 8080

# 서버 기동
CMD ["npm", "start"]
