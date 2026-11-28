import type { ParticipantIdentity } from '@doodle-nearby/core';
import { COLOR_CSS, ICON_EMOJI } from '../identity-view.js';

type Props = {
  identity: ParticipantIdentity;
  size?: number; // diameter in px, default 32
};

export function NameTag({ identity, size = 32 }: Props) {
  const bg = COLOR_CSS[identity.color];
  const emoji = ICON_EMOJI[identity.icon];
  const label = `${identity.color} ${identity.icon}`;

  return (
    <span
      role="img"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: bg,
        fontSize: size * 0.55,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {emoji}
    </span>
  );
}
