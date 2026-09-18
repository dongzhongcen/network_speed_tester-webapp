import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { Phase } from "./speedTest";

type Scene3DProps = {
  progress: number;
  phase: Phase;
  downloadMbps: number;
  reducedMotion: boolean;
};

function SpeedRing({
  progress,
  phase,
  reducedMotion,
}: {
  progress: number;
  phase: Phase;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const p = Math.min(100, Math.max(0, progress)) / 100;
  const active =
    phase === "ping" ||
    phase === "download" ||
    phase === "upload" ||
    phase === "china" ||
    phase === "probe";

  const accent =
    phase === "done"
      ? "#22C55E"
      : phase === "error"
        ? "#DC2626"
        : phase === "upload"
          ? "#FBBF24"
          : phase === "china" || phase === "probe"
            ? "#A78BFA"
            : "#38BDF8";

  useFrame((_, delta) => {
    if (!group.current || reducedMotion) return;
    const spin = active ? 0.35 + p * 0.8 : 0.08;
    group.current.rotation.z -= delta * spin;
    group.current.rotation.y += delta * 0.15;
    if (glow.current) {
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 + Math.sin(performance.now() * 0.003) * 0.05;
    }
  });

  return (
    <group ref={group} rotation={[0.4, 0.2, 0]}>
      {/* Track */}
      <mesh>
        <torusGeometry args={[1.55, 0.045, 24, 96]} />
        <meshBasicMaterial color="#1E3A5F" transparent opacity={0.85} />
      </mesh>

      {/* Progress arc approximated by scaled emissive torus + second ring */}
      <mesh scale={[1, 1, 1]} rotation={[0, 0, -Math.PI / 2]}>
        <torusGeometry args={[1.55, 0.07, 24, 128, Math.PI * 2 * Math.max(0.02, p)]} />
        <meshBasicMaterial color={accent} transparent opacity={0.95} />
      </mesh>

      {/* Inner core */}
      <mesh ref={glow}>
        <sphereGeometry args={[0.72, 48, 48]} />
        <meshStandardMaterial
          color="#10192E"
          emissive={accent}
          emissiveIntensity={0.35 + p * 0.55}
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>

      {/* Outer wire rings */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.95, 0.012, 12, 80]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, Math.PI / 5]}>
        <torusGeometry args={[2.15, 0.01, 12, 80]} />
        <meshBasicMaterial color="#22C55E" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function DataPackets({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const n = 180;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 2.4 + Math.random() * 2.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current || reducedMotion) return;
    ref.current.rotation.y += delta * (active ? 0.25 : 0.05);
    ref.current.rotation.x += delta * 0.03;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color="#7DD3FC"
        transparent
        opacity={0.75}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function SceneContent({ progress, phase, reducedMotion }: Scene3DProps) {
  const active =
    phase === "ping" ||
    phase === "download" ||
    phase === "upload" ||
    phase === "china" ||
    phase === "probe";

  return (
    <>
      <color attach="background" args={["#0B1224"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 3]} intensity={1.2} color="#E0F2FE" />
      <directionalLight position={[-3, -2, -4]} intensity={0.35} color="#22C55E" />

      {!reducedMotion && (
        <Stars radius={40} depth={30} count={1200} factor={3} saturation={0} fade speed={0.6} />
      )}

      <Float
        speed={reducedMotion ? 0 : 1.2}
        rotationIntensity={reducedMotion ? 0 : 0.25}
        floatIntensity={reducedMotion ? 0 : 0.4}
      >
        <SpeedRing progress={progress} phase={phase} reducedMotion={reducedMotion} />
      </Float>

      <DataPackets active={active} reducedMotion={reducedMotion} />
    </>
  );
}

export default function Scene3D(props: Scene3DProps) {
  return (
    <div className="scene-wrap" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 5.2], fov: 42 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.05;
        }}
      >
        <SceneContent {...props} />
      </Canvas>
    </div>
  );
}
