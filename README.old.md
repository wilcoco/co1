# 블록체인 기반 투자형 컨텐츠 서비스 (MVP)

## 프로젝트 소개
- 사용자가 글/사진/동영상/링크/음악 등 다양한 컨텐츠를 업로드
- 다른 사용자가 컨텐츠에 서비스 내 화폐로 투자
- 투자 내역, 배당, 지분 등은 해시 기반 블록체인 구조로 저장
- Firebase 기반 백엔드, React PWA 프론트엔드

## 주요 기술 스택
- Frontend: React + TypeScript (PWA)
- Backend: Firebase (Authentication, Firestore, Storage, Functions)
- Hash/Blockchain: crypto-js 등 해시 라이브러리

## 초기 구현 범위(MVP)
- 사용자 인증(로그인/회원가입)
- 컨텐츠 생성(글/사진/동영상/링크/음악)
- 전체 컨텐츠 조회
- 내 컨텐츠 조회
- 컨텐츠 상세(투자 기능 포함)

## 실행 방법
1. `npm install`
2. Firebase 프로젝트 세팅 후 환경변수 입력
3. `npm start`로 개발 서버 실행
