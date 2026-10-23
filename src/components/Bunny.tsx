import type { Mood } from '../lib/coach';

interface Props {
  mood?: Mood;
  size?: number;
  className?: string;
  bounce?: boolean;
}

const LINE = '#5a4650';
const PINK = '#ff8fab';
const PINK_SOFT = '#ffc2d1';
const FUR = '#fffdfb';

function Eyes({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'happy':
    case 'proud':
      return (
        <g stroke={LINE} strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M37 89 q6 -7 12 0" />
          <path d="M71 89 q6 -7 12 0" />
        </g>
      );
    case 'cheer':
      return (
        <g fill={LINE}>
          <path d="M43 81 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5 -2.4 -4.5 2.4 .9 -5 -3.6 -3.5 5 -.7z" />
          <path d="M77 81 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5 -2.4 -4.5 2.4 .9 -5 -3.6 -3.5 5 -.7z" />
        </g>
      );
    case 'sleepy':
      return (
        <g stroke={LINE} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M37 89 q6 4 12 0" />
          <path d="M71 89 q6 4 12 0" />
        </g>
      );
    case 'worried':
      return (
        <g>
          <g stroke={LINE} strokeWidth="2.6" strokeLinecap="round">
            <path d="M36 78 l11 -4" />
            <path d="M84 78 l-11 -4" />
          </g>
          <circle cx="43" cy="88" r="4.6" fill={LINE} />
          <circle cx="77" cy="88" r="4.6" fill={LINE} />
          <circle cx="44.6" cy="86.4" r="1.5" fill="#fff" />
          <circle cx="78.6" cy="86.4" r="1.5" fill="#fff" />
        </g>
      );
    default:
      return (
        <g>
          <circle cx="43" cy="88" r="5" fill={LINE} />
          <circle cx="77" cy="88" r="5" fill={LINE} />
          <circle cx="44.8" cy="86.2" r="1.7" fill="#fff" />
          <circle cx="78.8" cy="86.2" r="1.7" fill="#fff" />
        </g>
      );
  }
}

function Mouth({ mood }: { mood: Mood }) {
  if (mood === 'cheer' || mood === 'proud')
    return <path d="M52 101 q8 11 16 0 z" fill="#e5586f" stroke={LINE} strokeWidth="2.4" strokeLinejoin="round" />;
  if (mood === 'worried') return <path d="M53 105 q7 -5 14 0" stroke={LINE} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
  if (mood === 'sleepy') return <ellipse cx="60" cy="104" rx="3.2" ry="3.8" fill="#e5586f" stroke={LINE} strokeWidth="2" />;
  return <path d="M52 101 q4 5 8 0 q4 5 8 0" stroke={LINE} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
}

/** 蹦蹦：戴運動頭帶的兔子教練 */
export default function Bunny({ mood = 'happy', size = 96, className = '', bounce = false }: Props) {
  return (
    <svg
      className={`bunny ${bounce ? 'bunny-bounce' : ''} ${className}`}
      width={size}
      height={size * (140 / 120)}
      viewBox="0 0 120 140"
      role="img"
      aria-label="兔兔教練蹦蹦"
    >
      <defs>
        <clipPath id="bunny-head">
          <ellipse cx="60" cy="90" rx="44" ry="40" />
        </clipPath>
      </defs>
      {/* 耳朵 */}
      <g className="bunny-ear-l">
        <ellipse cx="40" cy="40" rx="13" ry="34" transform="rotate(-12 40 40)" fill={FUR} stroke={LINE} strokeWidth="3" />
        <ellipse cx="40" cy="43" rx="6.5" ry="24" transform="rotate(-12 40 43)" fill={PINK_SOFT} />
      </g>
      <g className="bunny-ear-r">
        <ellipse cx="80" cy="40" rx="13" ry="34" transform="rotate(12 80 40)" fill={FUR} stroke={LINE} strokeWidth="3" />
        <ellipse cx="80" cy="43" rx="6.5" ry="24" transform="rotate(12 80 43)" fill={PINK_SOFT} />
      </g>
      {/* 頭 */}
      <ellipse cx="60" cy="90" rx="44" ry="40" fill={FUR} />
      {/* 運動頭帶 */}
      <g clipPath="url(#bunny-head)">
        <path d="M10 66 Q60 54 110 66 L110 79 Q60 67 10 79 Z" fill={PINK} />
        <path d="M10 70.5 Q60 58.5 110 70.5" stroke="#fff" strokeWidth="2" fill="none" opacity="0.85" />
      </g>
      <ellipse cx="60" cy="90" rx="44" ry="40" fill="none" stroke={LINE} strokeWidth="3" />
      {/* 頭帶結 */}
      <path d="M102 70 l12 -7 l-2 12 z" fill={PINK} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M102 72 l13 4 l-9 8 z" fill={PINK} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      {/* 臉 */}
      <ellipse cx="33" cy="101" rx="8" ry="5" fill={PINK} opacity="0.45" />
      <ellipse cx="87" cy="101" rx="8" ry="5" fill={PINK} opacity="0.45" />
      <Eyes mood={mood} />
      <path d="M56.5 95 h7 l-3.5 4 z" fill="#e5586f" stroke="#e5586f" strokeWidth="1.6" strokeLinejoin="round" />
      <Mouth mood={mood} />
      {mood === 'worried' && <path d="M98 84 q3 6 0 9 q-3 -3 0 -9z" fill="#8ecae6" />}
      {mood === 'sleepy' && (
        <text x="92" y="60" fontSize="14" fontWeight="700" fill={LINE} fontFamily="sans-serif">
          z
        </text>
      )}
    </svg>
  );
}
