import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Play, Pause, RotateCcw, Send, Mic, Clock, Plus, Video } from 'lucide-react';

const SET_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b'];

export const VideoReviewHub = () => {
  const { videos, reviewVideo, clients } = useApp();

  const [filter, setFilter] = useState('pending');
  const [selectedId, setSelectedId] = useState(videos[0]?.id);
  const [feedbackText, setFeedbackText] = useState('');
  const [rating, setRating] = useState('Buena técnica 👍');
  const [timestamps, setTimestamps] = useState([]);
  const [tsNote, setTsNote] = useState('');
  const [drawColor, setDrawColor] = useState('#10b981');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const filtered = videos.filter((v) => filter === 'all' || v.status === filter);
  const currentVideo = videos.find((v) => v.id === selectedId) || filtered[0];

  useEffect(() => {
    if (currentVideo?.coachFeedback?.text) setFeedbackText(currentVideo.coachFeedback.text);
    else setFeedbackText('');
    setTimestamps(currentVideo?.timestamps || []);
    clearCanvas();
  }, [selectedId]);

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sc = Math.floor(s % 60);
    return `${m}:${sc < 10 ? '0' : ''}${sc}`;
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    isPlaying ? videoRef.current.pause() : videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const startDraw = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo((e.clientX - r.left) * scaleX, (e.clientY - r.top) * scaleY);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    ctx.lineTo((e.clientX - r.left) * scaleX, (e.clientY - r.top) * scaleY);
    ctx.stroke();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleAddTimestamp = () => {
    if (!tsNote.trim()) return;
    setTimestamps((prev) => [...prev, { time: fmt(currentTime), note: tsNote }]);
    setTsNote('');
  };

  const handleSendReview = () => {
    if (!currentVideo) return;
    reviewVideo(currentVideo.id, { text: feedbackText || 'Revisión completada.', rating, audioRecorded: false });
    alert(`✅ Análisis enviado a ${currentVideo.clientName}`);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start' }}>
      {/* ── VIDEO QUEUE SIDEBAR ── */}
      <div className="glass-panel" style={{ padding: '1.25rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Video size={18} color="var(--accent-emerald)" /> Cola de Vídeos
        </h3>
        <div style={{ display: 'flex', gap: 4, background: '#0f172a', padding: 4, borderRadius: 8 }}>
          {['pending', 'reviewed', 'all'].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              flex: 1, padding: '5px 0', borderRadius: 6, fontSize: '0.74rem', fontWeight: 700,
              background: filter === f ? 'var(--accent-emerald)' : 'transparent',
              color: filter === f ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', border: 'none',
            }}>
              {f === 'pending' ? 'Pendientes' : f === 'reviewed' ? 'Revisados' : 'Todos'}
            </button>
          ))}
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((v) => (
            <div key={v.id} onClick={() => setSelectedId(v.id)} style={{
              padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              background: selectedId === v.id ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${selectedId === v.id ? 'var(--accent-emerald)' : 'var(--border-color)'}`,
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{v.clientName}</span>
                <span className={`badge ${v.status === 'pending' ? 'badge-pending' : 'badge-reviewed'}`} style={{ fontSize: '0.65rem' }}>
                  {v.status === 'pending' ? 'Pendiente' : 'Revisado'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: 600, marginBottom: 4 }}>{v.exercise}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {v.loadKg} kg · {v.reps} reps · RPE {v.rpe}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Sin vídeos en esta categoría 🎉
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN REVIEW WORKSPACE ── */}
      {currentVideo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Info bar */}
          <div className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontWeight: 800, fontSize: '1.2rem' }}>{currentVideo.exercise}</h2>
                <span className="badge badge-active">{currentVideo.clientName}</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                <strong>{currentVideo.loadKg} kg</strong> × <strong>{currentVideo.reps} reps</strong> @ RPE {currentVideo.rpe} · RIR {currentVideo.rir}
              </div>
            </div>
            <button className="btn-primary" onClick={handleSendReview}><Send size={15} /> Enviar Análisis</button>
          </div>

          {/* Video Player + Canvas */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div className="video-canvas-wrapper">
              <video
                ref={videoRef}
                src={currentVideo.videoUrl}
                className="video-element"
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
              />
              <canvas
                ref={canvasRef}
                width={800} height={450}
                className="annotation-canvas"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={() => setIsDrawing(false)}
                onMouseLeave={() => setIsDrawing(false)}
              />
            </div>

            {/* Player controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: 10 }}>
              <button className="btn-icon" onClick={togglePlay}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', minWidth: 80 }}>{fmt(currentTime)} / {fmt(duration)}</span>
              <input type="range" min={0} max={duration || 100} value={currentTime}
                onChange={(e) => { if (videoRef.current) { videoRef.current.currentTime = Number(e.target.value); setCurrentTime(Number(e.target.value)); } }}
                style={{ flex: 1, accentColor: 'var(--accent-emerald)' }}
              />
            </div>

            {/* Draw toolbar */}
            <div className="drawing-toolbar" style={{ marginTop: 10 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Dibujar en pantalla:</span>
              {['#10b981', '#06b6d4', '#f59e0b', '#f43f5e', '#fff'].map((c) => (
                <div key={c} className={`color-dot ${drawColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setDrawColor(c)} />
              ))}
              <button className="btn-secondary" onClick={clearCanvas} style={{ padding: '4px 10px', fontSize: '0.75rem', marginLeft: 'auto' }}>
                <RotateCcw size={12} /> Limpiar
              </button>
            </div>
          </div>

          {/* Notes + Feedback */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {/* Client comment + timestamps */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontWeight: 800, color: 'var(--accent-cyan)', marginBottom: 8 }}>Comentario del cliente</h4>
              <p style={{ fontSize: '0.88rem', background: '#0f172a', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: '1rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                "{currentVideo.notes || 'Sin comentario adicional.'}"
              </p>
              <h4 style={{ fontWeight: 800, color: 'var(--accent-amber)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={15} /> Marcas de Tiempo
              </h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={tsNote} onChange={(e) => setTsNote(e.target.value)} placeholder={`Nota en ${fmt(currentTime)}`}
                  style={{ flex: 1, background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', padding: '7px 10px', borderRadius: 6, fontSize: '0.82rem' }}
                />
                <button className="btn-secondary" onClick={handleAddTimestamp} style={{ fontSize: '0.75rem' }}>
                  + {fmt(currentTime)}
                </button>
              </div>
              {timestamps.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 10px', background: '#1e293b', borderRadius: 6, fontSize: '0.8rem', marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, color: 'var(--accent-emerald)', flexShrink: 0 }}>{t.time}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{t.note}</span>
                </div>
              ))}
            </div>

            {/* Coach feedback */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontWeight: 800, color: 'var(--accent-emerald)', marginBottom: 8 }}>Tu Feedback</h4>
              <textarea rows={5} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Correcciones técnicas, recomendaciones de carga, puntos positivos..."
                style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: 10, borderRadius: 8, fontSize: '0.88rem', resize: 'none', marginBottom: 10 }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <select value={rating} onChange={(e) => setRating(e.target.value)}
                  style={{ flex: 1, background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', padding: '8px', borderRadius: 8, fontSize: '0.82rem' }}
                >
                  <option>Técnica Excelente 🌟</option>
                  <option>Buena técnica 👍</option>
                  <option>Ajustes necesarios ⚠️</option>
                  <option>Corregir urgente 🔴</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Selecciona un vídeo para comenzar el análisis.
        </div>
      )}
    </div>
  );
};
