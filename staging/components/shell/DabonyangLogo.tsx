"use client";

/**
 * 다보냥 로고 캐릭터 SVG — v2 세련된 힐링 캐릭터
 *
 * D3(비주얼): 미니멀 + 카와이 융합. 심플한 선, 부드러운 형태
 * P1(심리): 둥근 형태 = 안전감, 민트+크림 = 치유, 볼터치 = 친근
 * C1(카피): 로고와 함께 쓸 수 있는 독립 컴포넌트
 *
 * 사용처: 스플래시 화면, 헤더 아바타, 로그인 화면 등
 * 기존 logo.jpeg 대체용 SVG (투명 배경, 어디서든 자연스러움)
 */
export function DabonyangLogo({ size = 120 }: { size?: number }) {
  const scale = size / 120;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-label="다보냥 로고"
      style={{ display: "block" }}
    >
      {/* 배경 원 — 소프트 민트 그라데이션 */}
      <circle cx="60" cy="60" r="58" fill="url(#logoBg)" />
      <circle cx="60" cy="60" r="58" stroke="url(#logoBorder)" strokeWidth="1.5" fill="none" />

      {/* 몸통 — 크림+민트 그라데이션 */}
      <ellipse cx="60" cy="68" rx="30" ry="28" fill="url(#catBody)" />

      {/* 왼쪽 귀 */}
      <path
        d="M34 44 C31 26, 40 22, 45 38"
        fill="#d6f5f1"
        stroke="#a8ece6"
        strokeWidth="1.2"
      />
      <path d="M36 40 C34 30, 39 28, 42 36" fill="#fda4af" opacity="0.4" />

      {/* 오른쪽 귀 */}
      <path
        d="M86 44 C89 26, 80 22, 75 38"
        fill="#d6f5f1"
        stroke="#a8ece6"
        strokeWidth="1.2"
      />
      <path d="M84 40 C86 30, 81 28, 78 36" fill="#fda4af" opacity="0.4" />

      {/* 왼쪽 눈 — 큰 둥근 눈 + 하이라이트 */}
      <ellipse cx="48" cy="62" rx="5" ry="5.5" fill="#1a3a36" />
      <ellipse cx="50" cy="60" rx="2.2" ry="2.5" fill="#fff" />
      <ellipse cx="47" cy="64" rx="1" ry="1" fill="#fff" opacity="0.5" />

      {/* 오른쪽 눈 */}
      <ellipse cx="72" cy="62" rx="5" ry="5.5" fill="#1a3a36" />
      <ellipse cx="74" cy="60" rx="2.2" ry="2.5" fill="#fff" />
      <ellipse cx="71" cy="64" rx="1" ry="1" fill="#fff" opacity="0.5" />

      {/* 코 */}
      <path
        d="M57.5 70 L60 72.5 L62.5 70"
        fill="#ffab91"
        stroke="#ff8a65"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />

      {/* 입 — w자 */}
      <path
        d="M54 74 Q57 77 60 74 Q63 77 66 74"
        stroke="#2aa89b"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />

      {/* 볼터치 */}
      <ellipse cx="38" cy="70" rx="5.5" ry="3.5" fill="#ffab91" opacity="0.3" />
      <ellipse cx="82" cy="70" rx="5.5" ry="3.5" fill="#ffab91" opacity="0.3" />

      {/* 수염 */}
      <line x1="26" y1="65" x2="42" y2="67" stroke="#b0c9c5" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="25" y1="70" x2="42" y2="70" stroke="#b0c9c5" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="78" y1="67" x2="94" y2="65" stroke="#b0c9c5" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="78" y1="70" x2="95" y2="70" stroke="#b0c9c5" strokeWidth="0.8" strokeLinecap="round" />

      {/* 작은 하트 */}
      <path
        d="M88 32 C88 29.5, 90.5 27, 93 29.5 C95.5 27, 98 29.5, 98 32 C98 35.5, 93 38, 93 38 C93 38, 88 35.5, 88 32Z"
        fill="#fda4af"
        opacity="0.6"
      />

      {/* 반짝이 */}
      <path
        d="M24 28 L25.5 24.5 L27 28 L30.5 29.5 L27 31 L25.5 34.5 L24 31 L20.5 29.5Z"
        fill="#4fd1c5"
        opacity="0.45"
      />

      {/* 작은 앞발 */}
      <ellipse cx="46" cy="92" rx="7" ry="4" fill="#d6f5f1" stroke="#a8ece6" strokeWidth="0.8" />
      <ellipse cx="74" cy="92" rx="7" ry="4" fill="#d6f5f1" stroke="#a8ece6" strokeWidth="0.8" />

      <defs>
        <linearGradient id="logoBg" x1="10" y1="10" x2="110" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f1fbf9" />
          <stop offset="1" stopColor="#ecfdf5" />
        </linearGradient>
        <linearGradient id="logoBorder" x1="10" y1="10" x2="110" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a8ece6" />
          <stop offset="1" stopColor="#d6f5f1" />
        </linearGradient>
        <linearGradient id="catBody" x1="30" y1="40" x2="90" y2="96" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fdfcfa" />
          <stop offset="0.4" stopColor="#f1fbf9" />
          <stop offset="1" stopColor="#d6f5f1" />
        </linearGradient>
      </defs>
    </svg>
  );
}
