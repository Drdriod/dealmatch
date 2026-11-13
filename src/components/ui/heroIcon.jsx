import React from 'react'

// Wraps a Heroicons icon so it takes a `size` prop like the lucide icons used elsewhere.
export function heroIcon(Icon) {
  return function HeroIcon({ size = 16, ...rest }) {
    return <Icon width={size} height={size} aria-hidden="true" {...rest} />
  }
}
