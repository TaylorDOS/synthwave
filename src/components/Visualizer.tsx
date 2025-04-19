"use client";
import { useEffect, useRef, useState } from "react";
import { FaPlay, FaPause, FaForward, FaBackward, FaMusic, FaTimes, FaUpload, FaCog } from "react-icons/fa";
import * as THREE from "three";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createNoise2D } from 'simplex-noise';

export default function Visualizer() {
  // UI Controls
  const [showControls, setShowControls] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [showIntroModal, setShowIntroModal] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const scanlineRef = useRef<THREE.Mesh | null>(null);
  const noise2D = createNoise2D();

  const particleMaterialRef = useRef<THREE.PointsMaterial | null>(null);
  const scanlineMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sunColorRef = useRef<THREE.Color>(new THREE.Color(1.0, 0.2, 0.8));

  const sunColors = [
    new THREE.Color(1.0, 0.2, 0.8), // DeLorean: Pink
    new THREE.Color(1.0, 0.5, 0.1), // Muscle: Orange
    new THREE.Color(0.2, 1.0, 1.0), // Cyber: Cyan
  ];

  // car selector
  const carRef = useRef<THREE.Object3D | null>(null);
  const carPaths = [
    "/models/delorean/scene.gltf",
    "/models/muscle/scene.gltf",
    "/models/modern/scene.gltf",
  ];
  const carScales = [
    new THREE.Vector3(0.5, 0.5, 0.5),
    new THREE.Vector3(0.5, 0.5, 0.5),
    new THREE.Vector3(1, 1, 1),
  ];
  const carRotations = [
    new THREE.Euler(0, -Math.PI / 2, 0),
    new THREE.Euler(0, Math.PI, 0),
    new THREE.Euler(0, Math.PI, 0),
  ];
  const colorThemeRef = useRef<{ hStart: number; hEnd: number }>({ hStart: 0.9, hEnd: 0.6 });
  const carColorSettings = [
    { hStart: 0.9, hEnd: 0.05 },
    { hStart: 0.3, hEnd: 0.001 },
    { hStart: 0.75, hEnd: 0.65 },
  ];

  const carParticleColors = [
    new THREE.Color("#ff3cac"),
    new THREE.Color("#ff8c00"),
    new THREE.Color("#00e5ff"),
  ];

  const carBackgroundColors = [
    0x1a002a, // DeLorean – purple twilight
    0x2b0a00, // Muscle – sunset orange
    0x001d2d, // Cyber – deep blue
  ];

  const carModels = useRef<THREE.Object3D[]>([]);
  const loadedCars = useRef<boolean[]>([false, false, false]);
  const [currentCarIndex, setCurrentCarIndex] = useState(0);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);

  const width = 100;
  const height = 100;
  const widthSegments = 50;
  const heightSegments = 50;
  const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    wireframeLinewidth: 1
  });
  const faceMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const gridRef = useRef<THREE.Mesh | null>(null);
  const facesRef = useRef<THREE.Mesh | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGridVisible, setIsGridVisible] = useState(true);
  const [isFacesVisible, setIsFacesVisible] = useState(true);
  const [isAutoDrive, setIsAutoDrive] = useState(true);
  const isAutoDriveRef = useRef(isAutoDrive);

  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const [bloomStrength, setBloomStrength] = useState(0);
  const [bloomRadius, setBloomRadius] = useState(0);
  const [bloomThreshold] = useState(0);

  const [frequencyData, setFrequencyData] = useState<{ label: string; value: number }[]>([
    { label: "Sub-Bass", value: 0 },
    { label: "Bass", value: 0 },
    { label: "Low Mid", value: 0 },
    { label: "Mid", value: 0 },
    { label: "Upper Mid", value: 0 },
    { label: "Treble", value: 0 },
    { label: "High Treble", value: 0 },
  ]);

  async function loadShader(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${url}`);
    }
    return response.text();
  }

  async function loadShaders() {
    try {
      const vertexShader: string = await loadShader("/shaders/scanlineVertex.glsl");
      const fragmentShader: string = await loadShader("/shaders/scanlineFragment.glsl");
      return { vertexShader, fragmentShader };
    } catch (error) {
      console.error(error);
      return { vertexShader: "", fragmentShader: "" };
    }
  }

  const handleBackToUpload = () => {
    setAudioFile(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setShowIntroModal(true);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }
  };

  // noise with octaves, taken from
  // https://github.com/jwagner/simplex-noise-demo-synthwave/blob/13a5d96bada482b44a323c3b1ea6087102cb0ee2/fbm2d.ts
  const octaves = 3;
  function octaveNoise2d(x: number, y: number) {
    let value = 0.0;
    let amplitude = 0.5;
    let freq = 1.0;
    let gain = 0.5;
    for (let i = 0; i < octaves; i++) {
      value += noise2D(x, y) * amplitude;
      x *= freq;
      y *= freq;
      amplitude *= gain;
    }
    return value;
  };
  var t = 0; //time variable

  useEffect(() => {
    const threshold = 80;
    const handleMouseMove = (e: MouseEvent) => {
      const isNearBottom = window.innerHeight - e.clientY < threshold;

      if (isNearBottom) {
        setShowControls(true);
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
      } else {
        if (!hideTimeoutRef.current) {
          hideTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
            hideTimeoutRef.current = null;
          }, 5000);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (bloomPassRef.current) {
      bloomPassRef.current.strength = bloomStrength;
      bloomPassRef.current.radius = bloomRadius;
      bloomPassRef.current.threshold = bloomThreshold;
    }
  }, [bloomStrength, bloomRadius, bloomThreshold]);

  useEffect(() => {
    isAutoDriveRef.current = isAutoDrive;
  }, [isAutoDrive]);  

  useEffect(() => {
    let dataArray;
    let subBass, bass, lowMid, mid, upperMid, treble, highTreble;
    let renderer: THREE.WebGLRenderer | null = null;
    let animationId: number | null = null;
    
    async function init() {
      if (!mountRef.current) return;

      const { vertexShader, fragmentShader } = await loadShaders();
      if (!vertexShader || !fragmentShader) {
        console.error("Shaders failed to load.");
        return;
      }

      if (renderer!) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer = null;
      }

      // Set up Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      if (!sceneRef.current) {
        sceneRef.current = new THREE.Scene();
      }
      const scene = sceneRef.current;
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      mountRef.current.appendChild(renderer.domElement);

      //particles system
      const textureLoader = new THREE.TextureLoader();
      const circleTexture = textureLoader.load('/texture/circle.png');
      const particleCount = 300;
      const particleGeometry = new THREE.BufferGeometry();
      const positions = [];
      for (let i = 0; i < particleCount; i++) {
        positions.push(
          (Math.random() - 0.5) * 200,
          Math.random() * 100,
          (Math.random() - 0.5) * 200
        );
      }
      particleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const particleMaterial = new THREE.PointsMaterial({
        color: new THREE.Color("#ff3cac"),
        size: 0.8,
        transparent: true,
        opacity: 0.7,
        map: circleTexture,
        sizeAttenuation: true
      });
      particleMaterialRef.current = particleMaterial;

      const particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);

      //Background Color
      scene.background = new THREE.Color(carBackgroundColors[0]);

      //Camera Settings
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 20, 100);

      //Light Settings
      const light = new THREE.DirectionalLight(0xfff0e5, 5); // Cool bluish light
      light.position.copy(camera.position).add(new THREE.Vector3(0, 0, 0));
      light.target.position.set(0, 0, 0);
      scene.add(light);
      scene.add(light.target);

      //Camera Movement
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.dampingFactor = 0.05;
      controls.rotateSpeed = 0.5;
      controls.minDistance = 5;
      controls.maxDistance = 50;
      controls.enableDamping = true;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.maxPolarAngle = Math.PI / 2;

      //Bloom Effect
      composerRef.current = new EffectComposer(renderer);
      const composer = composerRef.current;
      composer.addPass(new RenderPass(scene, camera));
      if (!bloomPassRef.current) {
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          bloomStrength,
          bloomRadius,
          bloomThreshold
        );
        bloomPassRef.current = bloomPass;
        composer.addPass(bloomPass);
      }

      //Load Car Models
      const loader = new GLTFLoader();
      carPaths.forEach((path, index) => {
        loader.load(
          path,
          (gltf) => {
            const model = gltf.scene;
            model.userData.initialPosition = new THREE.Vector3(0, 1, 0);
            model.position.copy(model.userData.initialPosition);
            model.rotation.copy(carRotations[index]);
            model.scale.copy(carScales[index]);
            carModels.current[index] = model;
            if (!carRef.current && index === 0) {
              scene.add(model);
              carRef.current = model;
            }
            loadedCars.current[index] = true;
          },
          undefined,
          (error) => {
            console.error(`Error loading car model at ${path}:`, error);
          }
        );
      });

      // Horizon Sun
      const circleGeometry = new THREE.PlaneGeometry(50, 50, 64, 64);
      const scanlineMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          frequencyData: { value: 0 },
          randomOffset: { value: Math.random() * 10 },
          baseColor: { value: new THREE.Color(sunColors[0]) }
        },
        vertexShader,
        fragmentShader,
        transparent: true
      });
      scanlineMaterialRef.current = scanlineMaterial;
      const scanlineCircle = new THREE.Mesh(circleGeometry, scanlineMaterial);
      scanlineCircle.position.set(0, 0, -250);
      scene.add(scanlineCircle);
      scanlineRef.current = scanlineCircle;

      // Plane
      geometry.deleteAttribute("index");// Remove index to allow unique face colors

      const colors = [];

      // Create the meshes if they don't exist yet
      if (!gridRef.current) {
        gridRef.current = new THREE.Mesh(geometry, wireframeMaterial);
        gridRef.current.rotation.x = -Math.PI / 2;
        gridRef.current.position.y = 0.05;

        const vertexCount = geometry.attributes.position.count;
        for (let i = 0; i < vertexCount; i++) {
          colors.push(0, 0, 0);
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

        scene.add(gridRef.current);
      }

      if (!facesRef.current) {
        facesRef.current = new THREE.Mesh(geometry, faceMaterial);
        facesRef.current.rotation.x = -Math.PI / 2;
        scene.add(facesRef.current);
      }

      // Set initial visibility based on state
      gridRef.current.visible = isGridVisible;
      facesRef.current.visible = isFacesVisible;

      const animate = () => {
        

        if (analyserRef.current) {
          dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          subBass = averageFrequency(dataArray, 0, 1);
          bass = averageFrequency(dataArray, 2, 4);
          lowMid = averageFrequency(dataArray, 5, 8);
          mid = averageFrequency(dataArray, 9, 14);
          upperMid = averageFrequency(dataArray, 15, 19);
          treble = averageFrequency(dataArray, 20, 24);
          highTreble = averageFrequency(dataArray, 25, 31);

          setFrequencyData([
            { label: "Sub-Bass", value: subBass },
            { label: "Bass", value: bass },
            { label: "Low Mid", value: lowMid },
            { label: "Mid", value: mid },
            { label: "Upper Mid", value: upperMid },
            { label: "Treble", value: treble },
            { label: "High Treble", value: highTreble },
          ]);

          const position = geometry.attributes.position;
          const colorAttr = geometry.attributes.color;
          const vertexCount = position.count;
          const minZ = 0;
          const maxZ = 10;
          const zRange = maxZ - minZ;

          if (carRef.current) {
            const car = carRef.current;

            if (!isAutoDriveRef.current)
            {
              // Manual mode
              const speed = 0.2;
              t += 0.005;

              // Forward movement via LERP or WASD
              let forward = 0;
              let sideways = 0;
              let up = 0;

              if (keys.current.q) up += 1;
              if (keys.current.e) up -= 1;
              if (keys.current.w) forward += 1;
              if (keys.current.s) forward -= 1;
              if (keys.current.a) sideways -= 1;
              if (keys.current.d) sideways += 1;

              // Move car 
              let newY = car.position.y + up * speed;
              let newZ = car.position.z - forward * speed;
              let newX = car.position.x + sideways * speed;
              if ( -40 < newZ && newZ < 40 && -5 < newX && newX < 5 && 0 < newY && newY < 30)
              {
                car.position.x += sideways * speed;
                car.position.y += up * speed;
                car.position.z -= forward * speed;
              }
            }
            else
            {
              // Auto-drive mode
              const originalPos = carRef.current.userData.initialPosition;

              // add side-to-side noise
              carRef.current.position.x = noise2D(t, t) * 3;
              t += 0.005;

              carRef.current.position.z = THREE.MathUtils.lerp(
                carRef.current.position.z,
                originalPos.z - (mid * 35 - 10), // Increased magnitude (was 10, now 20)
                0.02 // Increased interpolation speed (was 0.01, now 0.02)
              );
            }

            // Camera follows
            controls.target.set(car.position.x, car.position.y, car.position.z);
          }

          // fraction of the width that will become the road
          const roadProportion = 1 / 12;

          // xIdx, yIdx is position of the point in the grid
          // of points
          for (let xIdx = 0; xIdx < widthSegments + 1; xIdx++) {
            for (let yIdx = 0; yIdx < heightSegments + 1; yIdx++) {
              // i is index in the `position array`
              const i = xIdx + yIdx * (heightSegments + 1);
              const x = position.getX(i);
              const y = position.getY(i);
              let z = position.getZ(i);

              // Normalize Z value between 0 and 1
              const normalizedZ = THREE.MathUtils.clamp((z - minZ) / zRange, 0, 1);

              //// Set z heights
              // use noise grid (2d grid) to map onto the points
              // * 0.15 is to make the curves smoother
              // +1 is so that all values are above 0 (default is -1 to 1)
              z = octaveNoise2d((xIdx % 50) * 0.15, (yIdx % 50) * 0.15) + 1;
              z *= 1.5;
              // add frequency components
              // TODO: make this more dynamic
              z += (dataArray[yIdx + 20] + dataArray[50 - yIdx + 20]) * 0.002;
              // make the road
              let sinHeight = Math.abs(Math.sin(Math.PI * x / width));
              z *= Math.max(sinHeight, 0.5);
              // if it is in the road, make it close to 0 but transition smoother
              if (Math.abs(x) < width * roadProportion) {
                z *= Math.exp(0.8 * (Math.abs(x) - width * roadProportion)) + 0.05;
                // console.log(z)
              }
              z *= 5;

              position.setZ(i, z);

              // Set HSL color (Blue -> Red Gradient)
              const { hStart, hEnd } = colorThemeRef.current;
              const hue = THREE.MathUtils.lerp(hStart, hEnd, normalizedZ);
              const color = new THREE.Color();
              color.setHSL(hue, 1, 0.5);
              colorAttr.setXYZ(i, color.r, color.g, color.b);

              // Common -y direction movement
              position.setY(i, y - 0.1);

              // If y position goes below -50, reset to 50
              let yNew = position.getY(i);
              if (yNew < -50) {
                position.setY(i, yNew + 100);
              }

              // TODO: instead of just making it black, maybe make it 
              // transition nicely into black

              if (position.getY(i) >= 47 || position.getY(i) <= -47) {
                // for the points which are joining back
                position.setZ(i, 0);
                colorAttr.setXYZ(i, 0, 0, 0);
              }
            }
          }

          // Mark geometry as updated
          position.needsUpdate = true;
          colorAttr.needsUpdate = true;

          // Update scanline effect
          if (scanlineRef.current) {
            scanlineMaterial.uniforms.frequencyData.value = mid;
            scanlineMaterial.uniforms.time.value += 0.05;

            // Scale the plane dynamically with frequency
            let scaleFactor = 1 + mid * 0.2;
            scanlineRef.current.scale.set(scaleFactor, scaleFactor, 1);
          }
        }

        particles.rotation.y += 0.0005;

        controls.update();
        composer.render();
        animationId = requestAnimationFrame(animate);

        return () => {
          if (animationId !== null) cancelAnimationFrame(animationId);

          renderer!.dispose();
          renderer!.forceContextLoss();
          if (mountRef.current) {
            mountRef.current.removeChild(renderer!.domElement);
          }
        };
      };
      animate();

      const averageFrequency = (dataArray: Uint8Array, start: number, end: number) => {
        const values = dataArray.slice(start, end + 1);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length / 255 : 0;
      };

      const handleResize = () => {
        const newAspectRatio = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer!.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer!.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
      });

      return () => {
        window.removeEventListener("resize", handleResize);

        // Dispose renderer safely
        renderer?.dispose();
        renderer?.forceContextLoss();

        // Dispose composer
        composerRef.current?.dispose(); // Add this line

        // Clean up DOM
        if (mountRef.current && renderer?.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }

        // Remove custom meshes from the scene
        if (gridRef.current) scene.remove(gridRef.current);
        if (facesRef.current) scene.remove(facesRef.current);
      };
    }
    init();
  }, []);

  const validKeys = ['q', 'e', 'w', 'a', 's', 'd'] as const;
  type Key = typeof validKeys[number];

  const keys = useRef<Record<Key, boolean>>({
    q: false,
    e: false,
    w: false,
    a: false,
    s: false,
    d: false,
  });

  useEffect(() => {
    const downHandler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase() as Key;
      if (validKeys.includes(key)) {
        keys.current[key] = true;
      }
    };

    const upHandler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase() as Key;
      if (validKeys.includes(key)) {
        keys.current[key] = false;
      }
    };

    window.addEventListener('keydown', downHandler);
    window.addEventListener('keyup', upHandler);
  
    return () => {
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
    };
  }, []);
  
  

  const handlePlayPause = async () => {
    if (!audioRef.current || !audioFile) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    await audioContextRef.current.resume();

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const loadAudioFile = (file: File) => {
    setAudioFile(file);
    const objectURL = URL.createObjectURL(file);

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = "anonymous";
    } else {
      // Pause previous audio and reset source
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    audioRef.current.src = objectURL;
    audioRef.current.load();

    // Add event listeners for time and duration updates
    audioRef.current.addEventListener('timeupdate', () => {
      setCurrentTime(audioRef.current?.currentTime || 0);
    });

    audioRef.current.addEventListener('loadedmetadata', () => {
      setDuration(audioRef.current?.duration || 0);
    });

    // Ensure AudioContext exists
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Check if source already exists to prevent multiple connections
    if (!sourceRef.current) {
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.5;

      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    }

    setShowControls(true);
    setShowIntroModal(false);
  };

  // Handle File Upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadAudioFile(file);
  };

  // Handle Drag & Drop
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) loadAudioFile(file);
  };

  // Prevent default behavior for drag over
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  // Toggle grid visibility
  const handleGridToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsGridVisible(e.target.checked);
    if (gridRef.current) {
      gridRef.current.visible = e.target.checked;
    }
  };

  // Toggle faces visibility
  const handleFacesToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const visible = e.target.checked;
    setIsFacesVisible(visible);
  
    if (facesRef.current) {
      facesRef.current.visible = visible;
    }
  
    if (gridRef.current) {
      const geometry = gridRef.current.geometry as THREE.BufferGeometry;
      const position = geometry.attributes.position;
      const minZ = 0;
      const maxZ = 10;
      const zRange = maxZ - minZ;
  
      if (!geometry.attributes.color) {
        const count = position.count;
        const colors = new Float32Array(count * 3); // r, g, b per vertex
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
  
      const colorAttr = geometry.attributes.color as THREE.BufferAttribute;
  
      if (visible) {
        gridRef.current.material = new THREE.MeshBasicMaterial({
          color: 0x000000,
          wireframe: true,
        });
      } else {
        // Update vertex colors based on height
        for (let xIdx = 0; xIdx < widthSegments + 1; xIdx++) {
          for (let yIdx = 0; yIdx < heightSegments + 1; yIdx++) {
            const i = xIdx + yIdx * (heightSegments + 1);
            const z = position.getZ(i);
  
            const normalizedZ = THREE.MathUtils.clamp((z - minZ) / zRange, 0, 1);
            const { hStart, hEnd } = colorThemeRef.current;
            const hue = THREE.MathUtils.lerp(hStart, hEnd, normalizedZ);
  
            const color = new THREE.Color();
            color.setHSL(hue, 1, 0.5);
            colorAttr.setXYZ(i, color.r, color.g, color.b);
          }
        }
  
        colorAttr.needsUpdate = true;
  
        gridRef.current.material = new THREE.MeshBasicMaterial({
          vertexColors: true,
          wireframe: true,
          transparent: true,
          opacity: 0.7,
        });
      }
    }
  };

  // Toggle auto drive
  const handleAutoDrive = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsAutoDrive(e.target.checked);
  };

  // Toggle settings popup
  const toggleSettingsPopup = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsSettingsOpen((prev) => !prev);
  };

  // Format time in MM:SS format
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const switchCar = (index: number) => {
    const scene = sceneRef.current;
    if (!scene || !loadedCars.current[index]) {
      console.warn(`Car model at index ${index} is not loaded yet or scene not initialized.`);
      return;
    }
    scene.background = new THREE.Color(carBackgroundColors[index]);

    // Remove previous car and detach the light
    if (carRef.current) {
      scene.remove(carRef.current);
    }

    if (particleMaterialRef.current) {
      particleMaterialRef.current.color.set(carParticleColors[index]);
    }

    if (scanlineMaterialRef.current) {
      scanlineMaterialRef.current.uniforms.baseColor.value = sunColors[index];
    }
    sunColorRef.current = sunColors[index];

    const newCar = carModels.current[index];
    if (newCar) {
      scene.add(newCar);
      carRef.current = newCar;
      setCurrentCarIndex(index);
      colorThemeRef.current = carColorSettings[index];
    }
  };

  return (
    <div className="w-screen h-screen relative" onDragOver={handleDragOver} onDrop={handleDrop}>
      <button
        onClick={handleBackToUpload}
        className="absolute top-4 left-4 p-2 text-white text-2xl bg-gray-600 hover:bg-pink-700 rounded-full shadow-md transition duration-300 hover:scale-110 z-10"
        title="Back to Upload"
      >
        <FaTimes />
      </button>
      <div ref={mountRef} className="absolute inset-0 w-full h-full"></div>

      <div className="absolute top-12 flex flex-col items-center p-4">
        <button
          onClick={toggleSettingsPopup}
          className={`p-3 text-white rounded-full shadow-lg transition duration-300 ${isSettingsOpen
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-gray-600 hover:bg-pink-700 active:scale-95 hover:scale-110"
            }`}
          title="Settings"
          disabled={isSettingsOpen}
        >
          <FaCog className="text-xl" />
        </button>
      </div>

      {isSettingsOpen && (
        <div className="absolute top-32 left-4 p-6 bg-gray-900 text-white rounded-2xl z-20 shadow-2xl border border-pink-500 max-w-xs w-full">
          {/* Close Button */}
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-pink-400">Settings</h3>
            <button
              onClick={toggleSettingsPopup}
              className="text-white hover:text-pink-500 transition duration-300"
              title="Close Settings"
            >
              <FaTimes />
            </button>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-3 mb-4">
            <div>
              <label className="flex items-center justify-between">
                <span>Auto Drive</span>
                <input
                  type="checkbox"
                  checked={isAutoDrive}
                  onChange={handleAutoDrive}
                  className="accent-pink-500 w-4 h-4"
                />
              </label>
              <div className='text-sm text-gray-400'>Q: vertical up | E: vertical down | W: forward | S: backward | A: left | D: right</div>
            </div>
            <label className="flex items-center justify-between">
              <span>Show Grid</span>
              <input
                type="checkbox"
                checked={isGridVisible}
                onChange={handleGridToggle}
                className="accent-pink-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between">
              <span>Show Faces</span>
              <input
                type="checkbox"
                checked={isFacesVisible}
                onChange={handleFacesToggle}
                className="accent-pink-500 w-4 h-4"
              />
            </label>
          </div>

          {/* Sliders */}
          <div className="flex flex-col gap-4 mb-4 text-sm">
            <label>
              Bloom Strength:
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={bloomStrength}
                onChange={(e) => setBloomStrength(parseFloat(e.target.value))}
                className="w-full accent-pink-500 mt-1"
              />
            </label>
            <label>
              Bloom Radius:
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={bloomRadius}
                onChange={(e) => setBloomRadius(parseFloat(e.target.value))}
                className="w-full accent-pink-500 mt-1"
              />
            </label>
          </div>

          {/* Car Switcher */}
          <div className="grid grid-cols-3 gap-2">
            {["DeLorean", "Muscle", "Cyber"].map((label, i) => (
              <button
                key={label}
                onClick={() => switchCar(i)}
                className={`text-xs p-2 rounded shadow-md transition duration-300 ${currentCarIndex === i
                    ? "bg-pink-700 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-pink-600 hover:text-white"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showIntroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          <div className="relative text-center p-8 bg-gray-900 rounded-2xl shadow-[0_0_60px_#ec4899aa] max-w-lg w-full border-2 border-pink-500">
            <FaMusic className="text-pink-500 text-4xl mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white">Synthwave Music Player</h2>
            <p className="text-white text-sm mb-4">Upload or drag an audio file to begin</p>
            <label className="relative inline-flex items-center gap-2 px-6 py-3 mb-4 bg-pink-500 hover:bg-pink-700 text-white font-bold rounded-lg cursor-pointer transition duration-300 shadow-lg overflow-hidden hover:scale-110">
              <FaUpload className="text-white text-xl" />
              <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
            </label>
            <p className="text-xs text-gray-400">Or drag a file anywhere on the screen</p>
          </div>
        </div>
      )}


      <div className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white p-4 max-w-4xl w-full overflow-y-auto max-h-60 flex flex-col items-center rounded-2xl border-2 border-pink-500 shadow-[0_0_30px_#ec489966] transition-transform duration-300 ${showControls ? "translate-y-0" : "translate-y-full"}`}>
        {audioFile && (
          <div className="w-full">
            <div className="text-white text-sm mb-2 truncate text-center">
              {audioFile.name}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white text-sm min-w-[45px]">{formatTime(currentTime)}</span>
              <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden cursor-pointer relative group"
                onClick={(e) => {
                  if (!audioRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = x / rect.width;
                  audioRef.current.currentTime = percentage * duration;
                }}
              >
                <div
                  className="h-full bg-pink-600 transition-all duration-100 absolute inset-0"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <div className="absolute inset-0 bg-transparent hover:bg-white/10 transition-colors duration-200" />
              </div>
              <span className="text-white text-sm min-w-[45px]">{formatTime(duration)}</span>
            </div>
            <div className="flex items-center justify-center gap-4 mt-2">
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0); // rewind 10 seconds
                  }
                }}
                disabled={!audioFile}
                className={`p-3 rounded-full shadow-lg transition duration-300 ${audioFile ? "text-white bg-gray-600 hover:bg-gray-700 active:scale-95 cursor-pointer"
                  : "text-gray-400 bg-gray-600 cursor-not-allowed"
                  }`}
                title="Rewind 10s"
              >
                <FaBackward />
              </button>

              <button
                onClick={handlePlayPause}
                disabled={!audioFile}
                className={`p-5 text-xl font-bold rounded-full shadow-lg transition duration-300 ${audioFile ? "text-white bg-pink-600 hover:bg-pink-700 active:scale-95 cursor-pointer"
                  : "text-gray-400 bg-gray-600 cursor-not-allowed"
                  }`}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <FaPause /> : <FaPlay />}
              </button>


              <button
                onClick={() => {
                  if (audioRef.current && duration) {
                    audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 10, duration); // skip ahead 10s
                  }
                }}
                disabled={!audioFile}
                className={`p-3 rounded-full shadow-lg transition duration-300 ${audioFile ? "text-white bg-gray-600 hover:bg-gray-700 active:scale-95 cursor-pointer"
                  : "text-gray-400 bg-gray-600 cursor-not-allowed"
                  }`}
                title="Forward 10s"
              >
                <FaForward />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
