import { useEffect, useRef } from 'react'

-- Premium real estate background
-- Deep architectural grid + floating property silhouettes + subtle gold particles
-- Mature, serious, aspirational: like a luxury property brochure
export default function HeroBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId
    let t = 0

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const W = () => canvas.width
    const H = () => canvas.height

    -- ── Particles: gold dust floating upward ──────────
    const particles = Array.from({ length: 40 }, () => ({
      x:     Math.random() * 1200,
      y:     Math.random() * 900,
      r:     0.8 + Math.random() * 2.2,
      speed: 0.15 + Math.random() * 0.4,
      drift: (Math.random() - 0.5) * 0.3,
      alpha: 0.2 + Math.random() * 0.5,
      pulse: Math.random() * Math.PI * 2,
    }))

    -- ── Connection lines: subtle property chain ───────
    const nodes = Array.from({ length: 5 }, (_, i) => ({
      x:     W() * (0.1 + i * 0.2),
      y:     H() * (0.25 + Math.sin(i * 1.3) * 0.2),
      vx:    (Math.random() - 0.5) * 0.25,
      vy:    (Math.random() - 0.5) * 0.15,
      r:     3 + Math.random() * 3,
      pulse: Math.random() * Math.PI * 2,
    }))

    const drawGrid = () => {
      -- Subtle perspective grid: like architectural blueprint
      const gridAlpha = 0.04
      ctx.strokeStyle = `rgba(201,106,58,${gridAlpha})`
      ctx.lineWidth   = 0.5

      const spacing = 60
      -- Horizontal lines
      for (let y = 0; y < H(); y += spacing) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W(), y)
        ctx.stroke()
      }
      -- Vertical lines
      for (let x = 0; x < W(); x += spacing) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H())
        ctx.stroke()
      }

      -- Diagonal accent lines: top right corner
      ctx.strokeStyle = `rgba(212,168,83,0.05)`
      ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) {
        const offset = i * 80
        ctx.beginPath()
        ctx.moveTo(W() - offset, 0)
        ctx.lineTo(W(), offset)
        ctx.stroke()
      }
    }

    const drawParticles = () => {
      particles.forEach(p => {
        p.y     -= p.speed
        p.x     += p.drift
        p.pulse += 0.02
        const alpha = p.alpha * (0.7 + Math.sin(p.pulse) * 0.3)

        -- Reset when off screen
        if (p.y < -10) {
          p.y = H() + 10
          p.x = Math.random() * W()
        }
        if (p.x < -10 || p.x > W() + 10) {
          p.x = Math.random() * W()
        }

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3)
        glow.addColorStop(0,   `rgba(212,168,83,${alpha})`)
        glow.addColorStop(0.5, `rgba(201,106,58,${alpha * 0.4})`)
        glow.addColorStop(1,   'rgba(201,106,58,0)')
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()
      })
    }

    const drawConnections = () => {
      -- Move nodes gently
      nodes.forEach(n => {
        n.x += n.vx
        n.y += n.vy
        n.pulse += 0.018

        if (n.x < 40 || n.x > W() - 40) n.vx *= -1
        if (n.y < 40 || n.y > H() - 40) n.vy *= -1
      })

      -- Draw connections between nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (dist > 350) continue

          const alpha = (1 - dist / 350) * 0.12
          const grad  = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
          grad.addColorStop(0,   `rgba(201,106,58,${alpha})`)
          grad.addColorStop(0.5, `rgba(212,168,83,${alpha * 1.5})`)
          grad.addColorStop(1,   `rgba(122,158,126,${alpha})`)

          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = grad
          ctx.lineWidth   = 0.8
          ctx.setLineDash([3, 8])
          ctx.lineDashOffset = -t * 0.3
          ctx.stroke()
          ctx.setLineDash([])
        }

        -- Draw node dot
        const n     = nodes[i]
        const scale = 1 + Math.sin(n.pulse) * 0.15
        const alpha = 0.25 + Math.sin(n.pulse) * 0.1

        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4 * scale)
        glow.addColorStop(0,   `rgba(201,106,58,${alpha})`)
        glow.addColorStop(0.5, `rgba(201,106,58,${alpha * 0.3})`)
        glow.addColorStop(1,   'rgba(201,106,58,0)')
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * 4 * scale, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * scale, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201,106,58,${alpha * 2})`
        ctx.fill()
      }
    }

    -- Large subtle circle accents: architectural feel
    const drawCircleAccents = () => {
      const accents = [
        { x: W() * 0.85, y: H() * 0.15, r: 180, color: 'rgba(212,168,83,0.04)' },
        { x: W() * 0.1,  y: H() * 0.8,  r: 140, color: 'rgba(201,106,58,0.04)' },
        { x: W() * 0.5,  y: H() * 0.5,  r: 300, color: 'rgba(122,158,126,0.025)' },
      ]
      accents.forEach(a => {
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
        ctx.strokeStyle = a.color
        ctx.lineWidth   = 1
        ctx.stroke()

        -- Inner ring
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.r * 0.6, 0, Math.PI * 2)
        ctx.strokeStyle = a.color
        ctx.stroke()
      })
    }

    const animate = () => {
      t++
      ctx.clearRect(0, 0, W(), H())
      drawGrid()
      drawCircleAccents()
      drawConnections()
      drawParticles()
      animId = requestAnimationFrame(animate)
    }

    animate()

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.7 }}
    />
  )
}
