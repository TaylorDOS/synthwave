"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createNoise2D } from 'simplex-noise';

export default function Visualizer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const scanlineRef = useRef<THREE.Mesh | null>(null);
  const carRef = useRef<THREE.Object3D | null>(null);
  const noise2D = createNoise2D();

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

  // Usage inside an async function
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

  useEffect(() => {
    async function init() {
      if (!mountRef.current) return;

      const { vertexShader, fragmentShader } = await loadShaders();
      if (!vertexShader || !fragmentShader) {
        console.error("Shaders failed to load.");
        return;
      }

      const scene = new THREE.Scene();
      // const gridHelper = new THREE.GridHelper(10, 10);
      // scene.add(gridHelper);

      // const axesHelper = new THREE.AxesHelper(5);
      // scene.add(axesHelper);

      // Set up Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      mountRef.current.appendChild(renderer.domElement);

      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, -10, 10);
      //camera.rotation.x = -Math.PI / 2;

      // Add OrbitControls for rotation
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; // Smooth rotation
      controls.dampingFactor = 0.05;
      controls.rotateSpeed = 0.5;
      controls.enableZoom = true; // Allow zooming
      controls.enablePan = true; // Allow panning (moving camera)
      controls.maxPolarAngle = Math.PI / 2;
      // set initial position
      controls.position0.set(
        -10,
        10,
        10
      );

      // Add Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      // Bloom Effect Setup
      const composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
      bloomPass.threshold = 0;
      bloomPass.strength = 1.0; // Bloom intensity
      bloomPass.radius = 0.5;
      composer.addPass(bloomPass);

      const loader = new GLTFLoader();
      loader.load("/models/delorean.gltf", (gltf) => {
        const model = gltf.scene;
        model.userData.initialPosition = new THREE.Vector3(-12, -1, 0);
        model.position.copy(model.userData.initialPosition); // Set initial position

        //model.position.set(-12, -1, 0);
        model.rotation.y = -Math.PI / 2;
        model.scale.set(1, 1, 1);
        carRef.current = model;
        scene.add(model);
      }, undefined, (error) => {
        console.error("Error loading DeLorean model:", error);
      });

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 10, 5);
      scene.add(directionalLight);

      // Plane settings
      const width = 100;
      const height = 100;
      const widthSegments = 50;
      const heightSegments = 50;
      const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);

      // Set material to allow vertex colors
      const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });
      const plane = new THREE.Mesh(geometry, material);
      plane.rotation.x = -Math.PI / 2;
      scene.add(plane);

      // Initialize vertex colors
      const colors = [];
      const vertexCount = geometry.attributes.position.count;
      for (let i = 0; i < vertexCount; i++) {
        colors.push(0, 0, 0);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

      // SUN with scanned lines
      const circleGeometry = new THREE.PlaneGeometry(50, 50, 64, 64);
      const scanlineMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          frequencyData: { value: 0 },
          randomOffset: { value: Math.random() * 10 },
          baseColor: { value: new THREE.Color(1.0, 0.2, 0.8) }
        },
        vertexShader,
        fragmentShader,
        transparent: true
      });
      const scanlineCircle = new THREE.Mesh(circleGeometry, scanlineMaterial);
      scanlineCircle.position.set(0, 0, -250);
      scene.add(scanlineCircle);
      scanlineRef.current = scanlineCircle;

      const animate = () => {
        requestAnimationFrame(animate);

        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          const subBass = averageFrequency(dataArray, 0, 1);
          const bass = averageFrequency(dataArray, 2, 4);
          const lowMid = averageFrequency(dataArray, 5, 8);
          const mid = averageFrequency(dataArray, 9, 14);
          const upperMid = averageFrequency(dataArray, 15, 19);
          const treble = averageFrequency(dataArray, 20, 24);
          const highTreble = averageFrequency(dataArray, 25, 31);

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

          const interpolationSpeed = 0.03;

          // fraction of the width that will become the road
          const roadProportion = 1 / 12;

          if (carRef.current) {
            const originalPos = carRef.current.userData.initialPosition;

            /*carRef.current.position.x = THREE.MathUtils.lerp(
              carRef.current.position.x,
              originalPos.x - (mid * 20 - 10), // Increased magnitude (was 10, now 20)
              0.02 // Increased interpolation speed (was 0.01, now 0.02)
            );*/

            // do the same for y (to make it move forward and back)
            carRef.current.position.z = THREE.MathUtils.lerp(
              carRef.current.position.z,
              originalPos.z - (mid * 20 - 10), // Increased magnitude (was 10, now 20)
              0.02 // Increased interpolation speed (was 0.01, now 0.02)
            );

            //model.userData.initialPosition = new THREE.Vector3(-12, -1, 0);
            // update camera to follow car

            controls.target.set(
              (carRef.current.position.x + 12),
              (carRef.current.position.y + 1),
              carRef.current.position.z
            );
          }


          //for (let i = 0; i < vertexCount; i++) {
          //
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

              if (Math.abs(x) < width * roadProportion) {
                // if it is in the road, make it transition smoother
                z = Math.exp(0.8 * (Math.abs(x) - width * roadProportion));
              } else {
                z = 1;
              }

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
                z *= Math.exp(0.8 * (Math.abs(x) - width * roadProportion));
              }
              z *= 5;

              position.setZ(i, z);
              /*
              // Section-based movement logic
              let heightOffset = 0;
              const adjustedX = x + width / 3;
              let col = adjustedX < width / 4 ? 0 : adjustedX < width / 4 + width / 8 ? 1 : 2;
              const row = Math.floor((y + height / 2) / (height / 3));

              const noiseFactor = noise2D(x * 0.1, y * 0.1 + performance.now() * 0.00005) * 0.3;

              if (row === 2 && col !== 1) {
                heightOffset = subBass + noiseFactor;
              } else if (row === 1 && col !== 1) {
                heightOffset = mid + noiseFactor;
              } else if (row === 0 && col !== 1) {
                heightOffset = highTreble + noiseFactor;
              }

              // Apply height change
              const randomMovement = Math.random() * (row === 2 ? 16 : row === 1 ? 14 : 2);
              z += (heightOffset * randomMovement - z) * interpolationSpeed;
              position.setZ(i, z);*/

              // Set HSL color (Blue -> Red Gradient)
              const color = new THREE.Color();
              color.setHSL(0.7 - normalizedZ * 0.7, 1, 0.5);
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
            scanlineMaterial.uniforms.frequencyData.value = highTreble;
            scanlineMaterial.uniforms.time.value += 0.05;

            // Scale the plane dynamically with frequency
            let scaleFactor = 1 + highTreble * 0.1;
            scanlineRef.current.scale.set(scaleFactor, scaleFactor, 1);
          }
        }

        //renderer.render(scene, camera);
        controls.update();
        composer.render();
      };
      animate();

      const averageFrequency = (dataArray: Uint8Array, start: number, end: number) => {
        const values = dataArray.slice(start, end + 1);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length / 255 : 0;
      };

      const handleResize = () => {
        const newAspectRatio = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        mountRef.current?.removeChild(renderer.domElement);
      };
    }

    init();
  }, []);

  // Handle Play/Pause Button Click
  const handlePlayPause = async () => {
    if (!audioRef.current || !audioFile) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    await audioContextRef.current.resume(); // Resume audio context for autoplay restrictions

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

  return (
    <div className="w-screen h-screen relative" onDragOver={handleDragOver} onDrop={handleDrop}>

      <div ref={mountRef} className="absolute inset-0 w-full h-full"></div>


      <div className="absolute top-5 left-1/2 transform -translate-x-1/2 flex flex-col items-center p-4 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold text-white">Synthwave Music Player</h1>
        <p className="text-white text-sm mb-4">Drag and drop an audio file</p>


        <div className="flex flex-row items-center gap-4">
          <label className="relative text-md px-6 py-3 font-bold text-white bg-blue-600 rounded-md shadow-lg cursor-pointer transition duration-300 hover:bg-blue-700">
            Upload
            <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <button
            onClick={handlePlayPause}
            disabled={!audioFile}
            className={`px-6 py-3 text-md font-bold rounded-md shadow-lg transition duration-300 ${audioFile ? "text-white bg-pink-600 hover:bg-pink-700 active:scale-95 cursor-pointer"
              : "text-gray-400 bg-gray-600 cursor-not-allowed"
              }`}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
        </div>
      </div>


      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-800/50 text-white p-4 rounded-lg shadow-lg max-w-4xl w-full overflow-y-auto max-h-60 flex flex-col items-center backdrop-blur-lg pointer-events-none">
        <h3 className="text-center text-lg font-bold mb-2">Equalizer Data</h3>
        <ul className="list-none text-sm flex flex-row w-full space-x-2">
          {frequencyData.map((band, index) => (
            <li key={index} className="flex flex-col p-2 bg-gray-700/50 rounded-md w-full text-center pointer-events-auto">
              <span className="font-bold">{band.label}</span>
              <span className="text-blue-400 items-end justify-end">{band.value.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
