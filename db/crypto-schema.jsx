import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Camera } from 'lucide-react'
import toast from 'react-hot-toast'

const CHALLENGES = [
  { id: 'fingers_2', instruction: 'Hold up 2 fingers to the camera', answer: 2, icon: '✌️' },
  { id: 'fingers_3', instruction: 'Hold up 3 fingers to the camera', answer: 3, icon: '🤟' },
  { id: 'fingers_1', instruction: 'Hold up 1 finger to the camera',  answer: 1, icon: '☝️' },
  { id: 'fingers_5', instruction: 'Show all 5 fingers (open palm)',   answer: 5, icon: '🖐️' },
  { id: 'thumbs_up', instruction: 'Give a thumbs up to the camera',   answer: 'thumb', icon: '👍' },
]

function getRandomChallenges() {
  const shuffled = [...CHALLENGES].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 2)
}

export default function LiveVerification({ onSuccess, onClose }) {
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)

  const [phase, setPhase]           = useState('intro')  -- intro | challenge | confirmed | success
  const [challenges]                = useState(getRandomChallenges)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [cameraReady, setCameraReady] = useState(false)
  const [progress, setProgress]     = useState(0)
  const [checking, setChecking]     = useState(false)

  const current = challenges[currentIdx]

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
      }
    } catch (err) {
      toast.error('Camera access denied. Please allow camera and try again.')
      onClose()
    }
  }, [onClose])

  const handleStart = async () => {
    setPhase('challenge')
    await startCamera()
  }

  const handleConfirm = () => {
    setChecking(true)
    -- Brief pause to feel like it's checking
    setTimeout(() => {
      setChecking(false)
      const next = currentIdx + 1
      setProgress((next / challenges.length) * 100)

      if (next >= challenges.length) {
        setPhase('success')
        stopCamera()
        setTimeout(() => onSuccess(), 1500)
      } else {
        setCurrentIdx(next)
      }
    }, 800)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(26,18,16,0.92)', backdropFilter: 'blur(10px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ backgroundColor: '#FFFAF5' }}>

        {/* Header */}
        <div className="p-5 flex items-center justify-between border-b"
          style={{ borderColor: '#E8DDD2' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(122,158,126,0.15)' }}>
              <Camera size={18} style={{ color: '#7A9E7E' }} />
            </div>
            <div>
              <h3 className="font-display text-lg font-black" style={{ color: '#1A1210' }}>
                🟢 Live Verification
              </h3>
              <p className="text-xs" style={{ color: '#8A7E78' }}>Prove you're a real person</p>
            </div>
          </div>
          <button onClick={() => { stopCamera(); onClose() }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(26,18,16,0.08)' }}>
            <X size={14} style={{ color: '#5C4A3A' }} />
          </button>
        </div>

        <div className="p-5">

          {/* Intro */}
          {phase === 'intro' && (
            <div className="text-center">
              <div className="text-5xl mb-4">🤳</div>
              <h4 className="font-display font-black text-xl mb-2" style={{ color: '#1A1210' }}>
                Quick live check
              </h4>
              <p className="text-sm leading-relaxed mb-6" style={{ color: '#8A7E78' }}>
                We'll show you 2 simple actions to complete on camera. This proves you're a real person and takes about 15 seconds.
              </p>

              <div className="space-y-2 mb-6 text-left">
                {challenges.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1px solid #E8DDD2' }}>
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: 'rgba(26,18,16,0.4)' }}>Step {i + 1}</p>
                      <p className="text-sm font-semibold" style={{ color: '#1A1210' }}>
                        {c.instruction}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={handleStart} className="btn-primary w-full py-4 mb-3">
                Start Verification →
              </button>
              <p className="text-xs" style={{ color: 'rgba(26,18,16,0.3)' }}>
                🔒 Video never stored or shared
              </p>
            </div>
          )}

          {/* Challenge */}
          {phase === 'challenge' && (
            <div className="text-center">

              {/* Progress dots */}
              <div className="flex justify-center gap-2 mb-4">
                {challenges.map((_, i) => (
                  <div key={i} className="h-1.5 w-8 rounded-full transition-all"
                    style={{
                      backgroundColor: i < currentIdx
                        ? '#7A9E7E'
                        : i === currentIdx
                          ? '#C96A3A'
                          : 'rgba(26,18,16,0.1)'
                    }} />
                ))}
              </div>

              {/* Camera */}
              <div className="relative rounded-2xl overflow-hidden mb-4"
                style={{ aspectRatio: '4/3', backgroundColor: '#1A1210' }}>
                <video ref={videoRef} className="w-full h-full object-cover"
                  muted playsInline autoPlay />

                {/* Face oval guide */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="rounded-full border-4 border-dashed"
                    style={{
                      width: 130, height: 160,
                      borderColor: checking ? '#7A9E7E' : '#C96A3A',
                      transition: 'border-color 0.3s',
                    }} />
                </div>

                {/* Instruction overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3"
                  style={{ background: 'linear-gradient(transparent, rgba(26,18,16,0.85))' }}>
                  <p className="text-white text-sm font-semibold text-center">
                    {checking ? '✓ Checking...' : `${current.icon}  ${current.instruction}`}
                  </p>
                </div>

                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(26,18,16,0.8)' }}>
                    <p className="text-white text-sm">Starting camera...</p>
                  </div>
                )}
              </div>

              {/* Step label */}
              <p className="text-xs font-bold uppercase tracking-wider mb-3"
                style={{ color: 'rgba(26,18,16,0.4)' }}>
                Step {currentIdx + 1} of {challenges.length}
              </p>

              {/* Confirm button */}
              <button
                onClick={handleConfirm}
                disabled={!cameraReady || checking}
                className="w-full py-4 rounded-2xl text-sm font-bold transition-all mb-2"
                style={{
                  backgroundColor: cameraReady && !checking ? '#C96A3A' : 'rgba(26,18,16,0.1)',
                  color: cameraReady && !checking ? '#FFFFFF' : '#8A7E78',
                }}>
                {checking ? 'Checking...' : `✓ Done: I completed this`}
              </button>
              <p className="text-xs" style={{ color: 'rgba(26,18,16,0.35)' }}>
                Tap when you've completed the action above
              </p>
            </div>
          )}

          {/* Success */}
          {phase === 'success' && (
            <div className="text-center py-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}>
                <div className="text-6xl mb-4">🟢</div>
              </motion.div>
              <h4 className="font-display font-black text-2xl mb-2" style={{ color: '#1A1210' }}>
                Live Verified!
              </h4>
              <p className="text-sm" style={{ color: '#8A7E78' }}>
                You've earned the highest trust badge on DealMatch.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
