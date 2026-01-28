
import React, { useEffect, useRef } from 'react';
import { VoiceState } from '../types';

interface SpatialRingProps {
  voiceState: VoiceState;
}

const SpatialRing: React.FC<SpatialRingProps> = ({ voiceState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let rotationX = 0.5;
    let rotationY = 0;
    let rotationZ = 0;

    const segments = 16;
    const innerRadius = 100;
    const depth = 50;

    // Cosmic background
    const stars = Array.from({ length: 150 }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: Math.random() * 2000,
      size: Math.random() * 1.5
    }));

    // Comets logic
    interface Comet {
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      active: boolean;
      life: number;
    }
    const comets: Comet[] = Array.from({ length: 5 }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, active: false, life: 0
    }));

    const triggerComet = (c: Comet) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 300 + Math.random() * 200;
      c.x = Math.cos(angle) * dist;
      c.y = (Math.random() - 0.5) * 400;
      c.z = Math.sin(angle) * dist;
      c.vx = -c.x * 0.05;
      c.vy = (Math.random() - 0.5) * 2;
      c.vz = -c.z * 0.05;
      c.active = true;
      c.life = 100;
    };

    interface Particle {
      x: number;
      y: number;
      z: number;
      size: number;
      speed: number;
    }

    const segmentParticles: Particle[][] = Array.from({ length: segments }, () => 
      Array.from({ length: 25 }, () => ({
        x: (Math.random() - 0.5) * 40,
        y: (Math.random() - 0.5) * depth,
        z: (Math.random() - 0.5) * 40,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.02
      }))
    );

    const project = (x: number, y: number, z: number) => {
      let x1 = x * Math.cos(rotationY) + z * Math.sin(rotationY);
      let z1 = z * Math.cos(rotationY) - x * Math.sin(rotationY);
      let y2 = y * Math.cos(rotationX) - z1 * Math.sin(rotationX);
      let z2 = z1 * Math.cos(rotationX) + y * Math.sin(rotationX);
      let x3 = x1 * Math.cos(rotationZ) - y2 * Math.sin(rotationZ);
      let y3 = y2 * Math.cos(rotationZ) + x1 * Math.sin(rotationZ);

      const perspective = 800 / (800 + z2);
      return {
        x: canvas.width / 2 + x3 * perspective,
        y: canvas.height / 2 + y3 * perspective,
        z: z2,
        scale: perspective
      };
    };

    const getColors = () => {
      if (!voiceState.isConnected || voiceState.isConnecting) {
        return { 
          primary: 'rgba(239, 68, 68, 1)', 
          secondary: 'rgba(239, 68, 68, 0.4)',
          glow: 'rgba(239, 68, 68, 0.8)' 
        }; // Red
      }
      if (voiceState.isSpeaking) {
        return { 
          primary: 'rgba(255, 215, 0, 1)', 
          secondary: 'rgba(255, 215, 0, 0.6)', 
          glow: 'rgba(255, 215, 0, 0.9)' 
        }; // Golden
      }
      return { 
        primary: 'rgba(59, 130, 246, 1)', 
        secondary: 'rgba(59, 130, 246, 0.4)', 
        glow: 'rgba(59, 130, 246, 0.7)' 
      }; // Blue
    };

    const getRippleDisplacement = (bx: number, by: number, bz: number) => {
      let dx = 0, dy = 0, dz = 0, totalGlow = 0;
      comets.forEach(c => {
        if (!c.active) return;
        const xDist = bx - c.x;
        const yDist = by - c.y;
        const zDist = bz - c.z;
        const distSq = xDist * xDist + yDist * yDist + zDist * zDist;
        const threshold = 120;
        if (distSq < threshold * threshold) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / threshold) * 25;
          dx += (xDist / dist) * force;
          dy += (yDist / dist) * force;
          dz += (zDist / dist) * force;
          totalGlow += force * 0.05;
        }
      });
      return { dx, dy, dz, glowBoost: totalGlow };
    };

    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isSpeaking = voiceState.isSpeaking;
      const isConnecting = voiceState.isConnecting;
      const currentColors = getColors();

      // Very slow rotations
      rotationY += isConnecting ? 0.003 : isSpeaking ? 0.002 : 0.0005;
      rotationZ += 0.0001;
      rotationX = 0.5 + Math.sin(time * 0.0005) * 0.1;
      
      const vibration = isSpeaking ? Math.sin(time * 0.05) * 8 : 0;

      // Draw background stars
      stars.forEach(s => {
        const proj = project(s.x, s.y, s.z - (time * 0.05) % 2000);
        if (proj.scale > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, proj.scale * 0.2)})`;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, s.size * proj.scale, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Update and draw comets
      comets.forEach(c => {
        if (!c.active && Math.random() > 0.995) triggerComet(c);
        if (c.active) {
          c.x += c.vx; c.y += c.vy; c.z += c.vz;
          c.life -= 1;
          if (c.life <= 0) c.active = false;
          
          const proj = project(c.x, c.y, c.z);
          const tail = project(c.x - c.vx * 10, c.y - c.vy * 10, c.z - c.vz * 10);
          
          const grad = ctx.createLinearGradient(proj.x, proj.y, tail.x, tail.y);
          grad.addColorStop(0, currentColors.primary);
          grad.addColorStop(1, 'transparent');
          
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2 * proj.scale;
          ctx.beginPath();
          ctx.moveTo(proj.x, proj.y);
          ctx.lineTo(tail.x, tail.y);
          ctx.stroke();
        }
      });

      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        
        // Ring center for this segment to calculate ripple
        const segmentBaseX = Math.cos(angle) * (innerRadius + 20) + vibration;
        const segmentBaseZ = Math.sin(angle) * (innerRadius + 20) + vibration;
        const ripple = getRippleDisplacement(segmentBaseX, 0, segmentBaseZ);

        // Apply glow with ripple boost
        ctx.shadowBlur = 15 + ripple.glowBoost * 100;
        ctx.shadowColor = currentColors.glow;

        segmentParticles[i].forEach(p => {
          const px = segmentBaseX + p.x + ripple.dx;
          const py = p.y + Math.sin(time * 0.001 + i) * 5 + ripple.dy;
          const pz = segmentBaseZ + p.z + ripple.dz;
          
          const proj = project(px, py, pz);
          const alpha = (proj.z + 400) / 800;
          ctx.fillStyle = currentColors.secondary.replace('0.6', alpha.toString()).replace('0.4', (alpha*0.6).toString());
          
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, p.size * proj.scale, 0, Math.PI * 2);
          ctx.fill();
        });

        const drawWireEdge = (lx: number, ly: number, lz: number, lx2: number, ly2: number, lz2: number) => {
          // Transform local box coordinates to world ring coordinates with ripple
          const getPos = (rx: number, ry: number, rz: number) => {
            const worldX = rx * Math.cos(angle) - rz * Math.sin(angle) + segmentBaseX;
            const worldY = ry;
            const worldZ = rx * Math.sin(angle) + rz * Math.cos(angle) + segmentBaseZ;
            const localRipple = getRippleDisplacement(worldX, worldY, worldZ);
            return { x: worldX + localRipple.dx, y: worldY + localRipple.dy, z: worldZ + localRipple.dz };
          };

          const p1Data = getPos(lx, ly, lz);
          const p2Data = getPos(lx2, ly2, lz2);

          const p1 = project(p1Data.x, p1Data.y, p1Data.z);
          const p2 = project(p2Data.x, p2Data.y, p2Data.z);
          
          ctx.beginPath();
          const baseAlpha = ((p1.z + p2.z) / 2 + 300) / 1200;
          ctx.strokeStyle = currentColors.primary.replace('1)', `${baseAlpha})`);
          ctx.lineWidth = (isSpeaking ? 2.5 : 1.0) + ripple.glowBoost * 5;
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        };

        const w = 18; const h = 18; const d = 18;
        // Strip-like appearance with glowing wires
        drawWireEdge(-w,-h,-d, w,-h,-d); drawWireEdge(w,-h,-d, w,h,-d); 
        drawWireEdge(w,h,-d, -w,h,-d); drawWireEdge(-w,h,-d, -w,-h,-d);
        drawWireEdge(-w,-h,d, w,-h,d); drawWireEdge(w,-h,d, w,h,d); 
        drawWireEdge(w,h,d, -w,h,d); drawWireEdge(-w,h,d, -w,-h,d);
        drawWireEdge(-w,-h,-d, -w,-h,d); drawWireEdge(w,-h,-d, w,-h,d);
        drawWireEdge(w,h,-d, w,h,d); drawWireEdge(-w,h,-d, -w,h,d);
        
        ctx.shadowBlur = 0; // Reset for background elements
      }

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [voiceState]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={600} 
      className="w-full h-full"
    />
  );
};

export default SpatialRing;
