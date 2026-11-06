import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AvatarDNA } from "@ec/shared";
import { createCharacter } from "../../game/character";

export interface KillCutsceneData {
  killerName: string;
  killerAvatar: AvatarDNA;
  victimName: string;
  victimAvatar: AvatarDNA;
}

type KillVariant = 0 | 1 | 2;

const VARIANT_LABELS: Record<KillVariant, { badge: string; subtitle: string }> = {
  0: {
    badge: "GOLPE FURTIVO NO EXPEDIENTE",
    subtitle: "Rescisão sumária sem aviso prévio!",
  },
  1: {
    badge: "CARIMBO: JUSTA CAUSA",
    subtitle: "Seu crachá foi revogado com força máxima!",
  },
  2: {
    badge: "GRAMPEADOR INDUSTRIAL",
    subtitle: "Arquivado permanentemente pelo Sabotador!",
  },
};

export function KillCutsceneOverlay({
  data,
  onClose,
}: {
  data: KillCutsceneData;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [impactFlash, setImpactFlash] = useState(false);

  // Escolhe uma das 3 animações icônicas de eliminação estilo Among Us
  const variant = useMemo<KillVariant>(() => {
    const hash =
      (data.killerName.length * 17 +
        data.victimName.length * 31 +
        Math.floor(Math.random() * 3)) %
      3;
    return (hash as KillVariant) ?? 0;
  }, [data.killerName, data.victimName]);

  // Fecha automaticamente após 3.8s ou com Espaço / Escape / Enter
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3800);

    const flashTimer = setTimeout(() => {
      setImpactFlash(true);
      setTimeout(() => setImpactFlash(false), 240);
    }, 410);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      clearTimeout(flashTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Palco 3D estilo Among Us com Sabotador atacando o seu boneco
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth || 760;
    const height = canvas.clientHeight || 280;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(0, 1.55, 5.2);
    camera.lookAt(0, 0.85, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Iluminação dramática de palco (holofote vermelho + luz de recorte fria)
    const ambient = new THREE.AmbientLight("#ffffff", 0.65);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight("#fff1f2", 1.65);
    keyLight.position.set(2.5, 5.5, 4.0);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const redRimLight = new THREE.PointLight("#ef4444", 3.2, 12);
    redRimLight.position.set(-2.2, 2.4, -1.5);
    scene.add(redRimLight);

    const rightFillLight = new THREE.PointLight("#38bdf8", 1.2, 10);
    rightFillLight.position.set(2.8, 1.8, 2.2);
    scene.add(rightFillLight);

    // Piso circular de holofote estilo Among Us
    const stageFloorMat = new THREE.MeshStandardMaterial({
      color: "#1e1b2e",
      roughness: 0.45,
      metalness: 0.25,
    });
    const stageFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.9, 3.1, 0.08, 40),
      stageFloorMat,
    );
    stageFloor.position.set(0, -0.04, 0);
    stageFloor.receiveShadow = true;
    scene.add(stageFloor);

    // Anel luminoso vermelho de impacto no chão
    const shockRingMat = new THREE.MeshBasicMaterial({
      color: "#ef4444",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const shockRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.68, 32),
      shockRingMat,
    );
    shockRing.rotation.x = -Math.PI / 2;
    shockRing.position.set(0.75, 0.015, 0);
    scene.add(shockRing);

    // Mancha vermelha sob a vítima após o golpe
    const puddleMat = new THREE.MeshBasicMaterial({
      color: "#b91c1c",
      transparent: true,
      opacity: 0,
    });
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 28),
      puddleMat,
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0.85, 0.012, 0);
    scene.add(puddle);

    // Boneco do Sabotador (esquerda, olhando para a direita)
    const killerChar = createCharacter(data.killerAvatar);
    const killerGroup = new THREE.Group();
    killerGroup.add(killerChar.root);
    killerGroup.position.set(-1.55, 0, 0);
    killerChar.root.rotation.y = Math.PI / 2;
    killerChar.setEmotion?.("adrenaline", 4);
    scene.add(killerGroup);

    // Boneco da Vítima (direita, olhando para a esquerda/frente)
    const victimChar = createCharacter(data.victimAvatar);
    const victimHolder = new THREE.Group();
    victimHolder.add(victimChar.root);
    const victimGroup = new THREE.Group();
    victimGroup.add(victimHolder);
    victimGroup.position.set(0.75, 0, 0);
    victimChar.root.rotation.y = -Math.PI / 2.4;
    victimChar.setEmotion?.("panic", 4);
    scene.add(victimGroup);

    // Arco de corte luminoso (Variante 0)
    const slashArcMat = new THREE.MeshBasicMaterial({
      color: "#f87171",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const slashArc = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.95, 24, 1, -0.8, 1.9),
      slashArcMat,
    );
    slashArc.position.set(0.55, 0.95, 0.35);
    slashArc.rotation.z = -0.35;
    scene.add(slashArc);

    // Carimbo Gigante "DEMITIDO" (Variante 1)
    const stampGroup = new THREE.Group();
    const stampWoodMat = new THREE.MeshStandardMaterial({
      color: "#7c2d12",
      roughness: 0.4,
    });
    const stampBaseMat = new THREE.MeshStandardMaterial({
      color: "#1e293b",
      roughness: 0.3,
      metalness: 0.6,
    });
    const stampPadMat = new THREE.MeshStandardMaterial({
      color: "#ef4444",
      emissive: "#dc2626",
      emissiveIntensity: 0.6,
    });
    const stampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.72, 0.22, 24),
      stampBaseMat,
    );
    stampBase.position.y = 0.14;
    const stampPad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.64, 0.64, 0.06, 24),
      stampPadMat,
    );
    stampPad.position.y = 0.03;
    const stampHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.26, 0.65, 18),
      stampWoodMat,
    );
    stampHandle.position.y = 0.55;
    const stampKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 18, 14),
      stampWoodMat,
    );
    stampKnob.position.y = 0.95;
    stampGroup.add(stampBase, stampPad, stampHandle, stampKnob);
    stampGroup.position.set(0.75, 3.8, 0);
    stampGroup.visible = variant === 1;
    scene.add(stampGroup);

    // Projéteis de grampeador / bolinhas de papel (Variante 2)
    const projectiles: THREE.Mesh[] = [];
    const projMat = new THREE.MeshStandardMaterial({
      color: "#facc15",
      emissive: "#ef4444",
      emissiveIntensity: 0.85,
      metalness: 0.8,
      roughness: 0.2,
    });
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.08), projMat);
      p.visible = false;
      scene.add(p);
      projectiles.push(p);
    }

    // Folhas de papel A4 que voam no momento do golpe
    const papers: {
      mesh: THREE.Mesh;
      vx: number;
      vy: number;
      vz: number;
      rx: number;
      rz: number;
    }[] = [];
    const paperGeo = new THREE.PlaneGeometry(0.26, 0.34);
    const paperMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.75,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 12; i++) {
      const pm = new THREE.Mesh(paperGeo, paperMat);
      pm.position.set(0.75, 0.85, 0);
      pm.visible = false;
      scene.add(pm);
      const angle = (i / 12) * Math.PI * 2 + (i % 3) * 0.2;
      const spd = 1.6 + (i % 4) * 0.55;
      papers.push({
        mesh: pm,
        vx: Math.cos(angle) * spd,
        vy: 2.2 + (i % 3) * 0.85,
        vz: Math.sin(angle) * spd * 0.65,
        rx: (i % 2 === 0 ? 1 : -1) * (4 + i * 0.5),
        rz: (i % 3 === 0 ? 1 : -1) * (3 + i * 0.4),
      });
    }

    const startTime = performance.now();
    let lastTime = startTime;
    let triggeredStrike = false;
    let reqId = 0;

    const animate = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsed = (now - startTime) / 1000;

      // Dispara gesto de ataque do Sabotador
      if (elapsed >= 0.26 && !triggeredStrike) {
        triggeredStrike = true;
        killerChar.play(variant === 0 ? "dash" : "throw");
      }

      // 1. Movimento do Sabotador e da arma conforme a variante
      if (variant === 0) {
        // Golpe Furtivo: avança velozmente até a vítima
        if (elapsed < 0.25) {
          const p = elapsed / 0.25;
          killerGroup.position.x = -1.55 - p * 0.15;
          killerChar.update(dt, 0.2);
        } else if (elapsed < 0.44) {
          const p = (elapsed - 0.25) / 0.19;
          const ease = 1 - Math.pow(1 - p, 3);
          killerGroup.position.x = -1.7 + ease * 1.95;
          killerChar.update(dt, 1.0);
        } else {
          killerGroup.position.x = 0.25;
          killerChar.update(dt, 0);
        }

        // Arco de corte vermelho
        if (elapsed >= 0.38 && elapsed <= 0.68) {
          const k = (elapsed - 0.38) / 0.3;
          slashArcMat.opacity = Math.sin(k * Math.PI) * 0.95;
          slashArc.scale.setScalar(0.8 + k * 0.65);
          slashArc.rotation.z = -0.5 + k * 1.6;
        } else {
          slashArcMat.opacity = 0;
        }
      } else if (variant === 1) {
        // Carimbo Gigante: salta e desce o carimbo "DEMITIDO"
        if (elapsed < 0.38) {
          const p = elapsed / 0.38;
          killerGroup.position.x = -1.55 + p * 1.1;
          killerGroup.position.y = Math.sin(p * Math.PI) * 0.55;
          stampGroup.position.y = 2.6 - p * 0.4;
          killerChar.update(dt, 0.8);
        } else if (elapsed < 0.48) {
          const p = (elapsed - 0.38) / 0.1;
          stampGroup.position.y = 2.2 * (1 - p) + 0.16 * p;
          killerGroup.position.y = Math.max(0, (1 - p) * 0.25);
          killerChar.update(dt, 0.4);
        } else {
          const lift = Math.min(1, Math.max(0, (elapsed - 0.95) / 0.4));
          stampGroup.position.y = 0.16 + lift * 2.5;
          killerChar.update(dt, 0);
        }
      } else {
        // Variante 2: Disparo de Grampeador Industrial
        if (elapsed < 0.35) {
          const p = elapsed / 0.35;
          killerGroup.position.x = -1.55 + p * 0.65;
          killerChar.update(dt, 0.6);
        } else {
          killerChar.update(dt, 0);
        }

        projectiles.forEach((proj, idx) => {
          const startP = 0.34 + idx * 0.055;
          const durP = 0.14;
          if (elapsed >= startP && elapsed <= startP + durP) {
            const k = (elapsed - startP) / durP;
            proj.visible = true;
            proj.position.set(-0.55 + k * 1.35, 0.92 + (idx - 1) * 0.12, 0.1);
          } else {
            proj.visible = false;
          }
        });
      }

      // 2. Reação da Vítima (impacto em t = 0.42s)
      if (elapsed < 0.42) {
        // Tremedeira de susto antes do golpe
        victimGroup.position.x = 0.75 + Math.sin(elapsed * 55) * 0.03;
        victimChar.update(dt, 0.15);
      } else {
        const hitT = elapsed - 0.42;
        const fallProgress = Math.min(1, hitT / 0.32);

        if (variant === 1) {
          // Amassado pelo carimbo gigante
          const squash = 1 - fallProgress * 0.84;
          const stretch = 1 + fallProgress * 0.42;
          victimHolder.scale.set(stretch, Math.max(0.14, squash), stretch);
          victimGroup.position.x = 0.75;
        } else {
          // Jogado para trás e caindo deitado no chão igual ao corpo do jogo
          const knockback = Math.min(1, hitT / 0.28);
          victimGroup.position.x = 0.75 + knockback * 0.38;
          victimGroup.position.y =
            hitT < 0.26 ? Math.sin((hitT / 0.26) * Math.PI) * 0.42 : 0;
          victimHolder.rotation.z = -fallProgress * (Math.PI / 2);
          victimHolder.position.y = fallProgress * 0.22;
        }

        // Anel de choque e mancha no chão
        if (hitT < 0.55) {
          const rk = hitT / 0.55;
          shockRing.scale.setScalar(0.5 + rk * 2.6);
          shockRingMat.opacity = (1 - rk) * 0.85;
        } else {
          shockRingMat.opacity = 0;
        }
        puddleMat.opacity = Math.min(0.82, hitT * 2.2);
        puddle.scale.setScalar(Math.min(1.15, 0.3 + hitT * 1.8));

        // Folhas de papel voando pelo escritório
        for (const p of papers) {
          p.mesh.visible = true;
          const pt = hitT;
          const px = 0.75 + p.vx * pt;
          const py = Math.max(0.02, 0.85 + p.vy * pt - 0.5 * 9.2 * pt * pt);
          const pz = p.vz * pt;
          p.mesh.position.set(px, py, pz);
          if (py > 0.03) {
            p.mesh.rotation.x = pt * p.rx;
            p.mesh.rotation.z = pt * p.rz;
          } else {
            p.mesh.rotation.x = -Math.PI / 2;
          }
        }
      }

      // Leve zoom dramático na câmera após o impacto
      if (elapsed >= 0.42) {
        const zoomT = Math.min(1, (elapsed - 0.42) / 0.6);
        const shake =
          elapsed < 0.65 ? Math.sin(elapsed * 90) * (0.65 - elapsed) * 0.35 : 0;
        camera.position.set(
          0.15 * zoomT + shake,
          1.55 - 0.15 * zoomT + shake * 0.6,
          5.2 - 0.65 * zoomT,
        );
        camera.lookAt(0.25 * zoomT, 0.65, 0);
      }

      renderer.render(scene, camera);
      reqId = requestAnimationFrame(animate);
    };

    reqId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(reqId);
      killerChar.dispose();
      victimChar.dispose();
      stageFloor.geometry.dispose();
      stageFloorMat.dispose();
      shockRing.geometry.dispose();
      shockRingMat.dispose();
      puddle.geometry.dispose();
      puddleMat.dispose();
      slashArc.geometry.dispose();
      slashArcMat.dispose();
      paperGeo.dispose();
      paperMat.dispose();
      projMat.dispose();
      renderer.dispose();
    };
  }, [data.killerAvatar, data.victimAvatar, variant]);

  const vInfo = VARIANT_LABELS[variant];

  return (
    <div
      className={`suspeito-kill-cutscene-backdrop ${impactFlash ? "impact-flash" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Você foi eliminado"
      onClick={onClose}
    >
      <div
        className="suspeito-kill-cutscene-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho de Eliminação */}
        <div className="suspeito-kill-header">
          <span className="suspeito-kill-variant-badge">{vInfo.badge}</span>
          <h2 className="suspeito-kill-title">💀 VOCÊ FOI ELIMINADO!</h2>
          <p className="suspeito-kill-subtitle">{vInfo.subtitle}</p>
        </div>

        {/* Faixa Cinematográfica Estilo Among Us */}
        <div className="suspeito-kill-letterbox">
          <div className="suspeito-kill-speedlines" />
          <div className="suspeito-kill-spotlight" />
          <canvas ref={canvasRef} className="suspeito-kill-canvas" />

          {/* Rótulos dos personagens no palco */}
          <div className="suspeito-kill-stage-labels">
            <div className="suspeito-kill-char-tag killer">
              <span className="tag-role">🔪 SABOTADOR</span>
              <strong>{data.killerName}</strong>
            </div>
            <div className="suspeito-kill-char-tag victim">
              <span className="tag-role">📋 VOCÊ</span>
              <strong>{data.victimName}</strong>
            </div>
          </div>
        </div>

        {/* Rodapé com Identidade do Sabotador e Instrução de Fantasma */}
        <div className="suspeito-kill-footer">
          <div className="suspeito-kill-killer-card">
            <span className="killer-label">ELIMINADO POR</span>
            <strong className="killer-name">🔪 {data.killerName}</strong>
          </div>
          <p className="suspeito-kill-ghost-hint">
            👻 Agora você é um <strong>Fantasma</strong>! Você atravessa paredes e pode
            continuar concluindo suas tarefas para ajudar a equipe a vencer.
          </p>
          <button
            type="button"
            className="btn primary suspeito-kill-continue-btn"
            onClick={onClose}
          >
            Continuar como Fantasma (Espaço)
          </button>
        </div>
      </div>
    </div>
  );
}
