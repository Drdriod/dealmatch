import React, { useEffect, useRef } from 'react'

/**
 * Animated canvas background for the HomePage hero.
 * Draws drifting particles and soft connection lines: 
 * symbolises matching/connection without being heavy on perf.
 */
export default function HeroBackground({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')
    let animId
    let W, H

    const PARTICLE_COUNT = 55
    const particles = []

    class Particle {
      constructor() { this.reset() }
      reset() {
        this.x  = Math.random() * W
        this.y  = Math.random() * H
        this.vx = (Math.random() - 0.5) * 0.4
        this.vy = (Math.random() - 0.5) * 0.4
        this.r  = Math.random() * 2 + 1
        this.alpha = Math.random() * 0.5 + 0.1
      }
      update() {
        this.x += this.vx
        this.y += this.vy
        if (this.x < 0 || this.x > W) this.vx *= -1
        if (this.y < 0 || this.y > H) this.vy *= -1
      }
      draw() {
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201,106,58,${this.alpha})`
        ctx.fill()
      }
    }

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
    }

    const init = () => {
      resize()
      particles.length = 0
      for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle())
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      // Connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x
          const dy   = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(201,106,58,${0.12 * (1 - dist / 120)})`
            ctx.lineWidth   = 0.8
            ctx.stroke()
          }
        }
      }

      particles.forEach(p => { p.update(); p.draw() })
      animId = requestAnimationFrame(draw)
    }

    init()
    draw()
    window.addEventListener('resize', init)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', init)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
