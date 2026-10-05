import { useInView } from 'react-intersection-observer'
import CountUp from 'react-countup'

export default function AnimatedStat({ value, suffix = '', prefix = '', label, color = 'text-blush' }) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 })

  const numericValue = parseFloat(value.toString().replace(/[^0-9.]/g, '')) || 0
  const isDecimal = value.toString().includes('.')

  return (
    <div ref={ref} className="text-center px-0.5 sm:px-2">
      <p className="font-display font-black" style={{
        fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
        color: '#F3C96A',
        lineHeight: 1.1,
        letterSpacing: '-0.02em',
      }}>
        {prefix}
        {inView ? (
          <CountUp
            start={0}
            end={numericValue}
            duration={2.5}
            separator=","
            decimals={isDecimal ? 1 : 0}
          />
        ) : '0'}
        {suffix}
      </p>
      <p className="text-xs mt-1.5 leading-tight" style={{color:'rgba(255,255,255,0.65)'}}>
        {label}
      </p>
    </div>
  )
}
