"use client";

// TODO: errors abt XYZ thing on console 
// TODO: base grid and the grid on the plane conflict (only one at once)
// TODO: more options?

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
    
    const scene = new THREE.Scene();
    // const bloomPass = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 1.5, 0.4, 0.85);
    const bloomPassRef = useRef<UnrealBloomPass | null>(null);
    const geometry = new THREE.PlaneGeometry(100, 100, 50, 50);
    const wireframeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000, 
        wireframe: true, 
        wireframeLinewidth: 1 
    });
    const faceMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const gridRef = useRef<THREE.Mesh | null>(null);
    const facesRef = useRef<THREE.Mesh | null>(null);
    let bloomStrengthValue = 0.3;
    let bloomThresholdValue = 0.0;
    let bloomRadiusValue = 0.2;

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isGridVisible, setIsGridVisible] = useState(true);
    const [isFacesVisible, setIsFacesVisible] = useState(true);
    const [bloomStrength, setBloomStrength] = useState(1);
    const [bloomRadius, setBloomRadius] = useState(1);
    const [bloomThreshold, setBloomThreshold] = useState(0.5);

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

    useEffect(() => {
        async function init() {
            if (!mountRef.current) return;

            const { vertexShader, fragmentShader } = await loadShaders();
            if (!vertexShader || !fragmentShader) {
                console.error("Shaders failed to load.");
                return;
            }

            // Set up Renderer
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(window.innerWidth, window.innerHeight);
            mountRef.current.appendChild(renderer.domElement);

            const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 5, 35);

            // Add OrbitControls for rotation
            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true; // Smooth rotation
            controls.dampingFactor = 0.05;
            controls.rotateSpeed = 0.5;
            controls.enableZoom = true; // Allow zooming
            controls.minDistance = 5; 
            controls.maxDistance = 50;
            controls.enablePan = true; // Allow panning (moving camera)
            controls.maxPolarAngle = Math.PI / 2;

            // Add Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);

            // Bloom Effect Setup
            const composer = new EffectComposer(renderer);
            const renderPass = new RenderPass(scene, camera);
            composer.addPass(renderPass);
            console.log('this', composer,  renderPass)

            if (!bloomPassRef.current) {
                const bloomPass = new UnrealBloomPass(
                    new THREE.Vector2(window.innerWidth, window.innerHeight),
                    bloomStrength, 
                    bloomRadius, 
                    bloomThreshold
                  );
                  bloomPassRef.current = bloomPass; // Store bloomPass reference
                  composer.addPass(bloomPass);
            } else {
                // Update bloom effect dynamically
                bloomPassRef.current.strength = bloomStrength;
                bloomPassRef.current.radius = bloomRadius;
                bloomPassRef.current.threshold = bloomThreshold;
            }

            const loader = new GLTFLoader();
            loader.load("/models/palmTree.gltf", (gltf) => {
                const model = gltf.scene;
                // model.userData.initialPosition = new THREE.Vector3(-12, -1, 0);
                model.userData.initialPosition = new THREE.Vector3(-0, -0, 25);
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
            // const widthSegments = 50;
            // const heightSegments = 50;
            // const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);

            // Remove index to allow unique face colors
            geometry.deleteAttribute("index");

            // Create color array for faces
            const colors = [];
            const faceCount = geometry.attributes.position.count / 3; // Each face has 3 vertices

            for (let i = 0; i < faceCount; i++) {
                const color = new THREE.Color(Math.random(), Math.random(), Math.random()); // Random color per face
                for (let j = 0; j < 3; j++) {
                    colors.push(color.r, color.g, color.b);
                }
            }

            // // Apply face colors
            // geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

            // // Mesh for colored faces
            // const planeWithColor = new THREE.Mesh(geometry, faceMaterial);
            // planeWithColor.rotation.x = -Math.PI / 2;
            // scene.add(planeWithColor); // Adds colored plane

            // // Mesh for wireframe/grid lines
            // const planeWireframe = new THREE.Mesh(geometry, wireframeMaterial);
            // planeWireframe.rotation.x = -Math.PI / 2;
            // scene.add(planeWireframe); // Adds colored grid

            // // Initialize vertex colors
            // const vertexCount = geometry.attributes.position.count;
            // for (let i = 0; i < vertexCount; i++) {
            //     colors.push(0, 0, 0);
            // }
            // geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

            // // Uncomment this if wants colored grid only and comment adding colored plane code
            // const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });
            // const plane = new THREE.Mesh(geometry, material);
            // plane.rotation.x = -Math.PI / 2;
            // scene.add(plane);

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
            
            // Create the meshes if they don't exist yet
            if (!gridRef.current) {
                gridRef.current = new THREE.Mesh(geometry, wireframeMaterial);
                gridRef.current.rotation.x = -Math.PI / 2;

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

                    if (carRef.current) {
                        const originalPos = carRef.current.userData.initialPosition;
                    
                        carRef.current.position.x = THREE.MathUtils.lerp(
                            carRef.current.position.x,
                            originalPos.x - treble * 10 +  subBass * 5 , // Car movement in x axis
                            0.02 // Increased interpolation speed (was 0.01, now 0.02)
                        );

                        carRef.current.position.z = THREE.MathUtils.lerp(
                            carRef.current.position.z,
                            originalPos.z - subBass * 12 + bass * 8, // Car movement in x axis
                            0.04 // Increased interpolation speed (was 0.01, now 0.02)
                        );

                        carRef.current.rotation.y = THREE.MathUtils.lerp(
                            carRef.current.rotation.y,
                            originalPos.y - subBass * 12 + bass * 8, // Car movement in x axis
                            0.04 // Increased interpolation speed (was 0.01, now 0.02)
                        );
                    }
                    

                    for (let i = 0; i < vertexCount; i++) {
                        const x = position.getX(i);
                        const y = position.getY(i);
                        let z = position.getZ(i);

                        // Normalize Z value between 0 and 1
                        const normalizedZ = THREE.MathUtils.clamp((z - minZ) / zRange, 0, 1);

                        // Set HSL color (Blue -> Red Gradient)
                        const color = new THREE.Color();
                        if (y >= 45 || y <= -45 ) {
                            color.setRGB(0, 0, 0); 
                            color.lerp(new THREE.Color(0, 0, 0), 0);

                            faceMaterial.opacity = 0;  
                            wireframeMaterial.opacity = 0;
                        } else {
                            color.setHSL(0.7 - normalizedZ * 0.7, 1, 0.5); // Default gradient
                        }
                    
                        colorAttr.setXYZ(i, color.r, color.g, color.b);

                        // Section-based movement logic
                        let heightOffset = 0;
                        const adjustedX = x + width / 3.2;
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
                        position.setZ(i, z);

                        // Common -y direction movement
                        position.setY(i, y - 0.1);

                        // If y position goes below -50, reset to 50
                        if (position.getY(i) < -50) {
                            position.setY(i, 49.9);
                        }

                        if (position.getY(i) >= 47) {
                            position.setZ(i, 0);
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
                if (gridRef.current) scene.remove(gridRef.current);
                if (facesRef.current) scene.remove(facesRef.current);

                renderer.dispose();
                renderer.forceContextLoss(); // Releases the WebGL context
                document.body.removeChild(renderer.domElement);
            };
        }

        init();
    }, [bloomStrength, bloomRadius, bloomThreshold]);

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
 
    // Toggle grid visibility
    const handleGridToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsGridVisible(e.target.checked);
        if (gridRef.current) {
            gridRef.current.visible = e.target.checked;
        }
    };

    // Toggle faces visibility
    const handleFacesToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsFacesVisible(e.target.checked);
        if (facesRef.current) {
            facesRef.current.visible = e.target.checked;
        }
    };

    // Handle bloom settings
    const handleBloomStrengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBloomStrength(parseFloat(e.target.value));
        bloomStrengthValue = parseFloat(e.target.value);
        
    };

    const handleBloomRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBloomRadius(parseFloat(e.target.value));
        bloomRadiusValue = parseFloat(e.target.value);
    };

    const handleBloomThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBloomThreshold(parseFloat(e.target.value));
        bloomThresholdValue = parseFloat(e.target.value);
    };

    // Toggle settings popup
    const toggleSettingsPopup = (e: React.MouseEvent<HTMLButtonElement>) => {
        setIsSettingsOpen((prev) => !prev);
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

            <div className="absolute top-5 flex flex-col items-center p-4 rounded-xl shadow-lg">
                <button
                    onClick={toggleSettingsPopup}
                    className={`px-6 py-3 text-md font-bold rounded-md shadow-lg transition duration-300 "text-white bg-orange-600 hover:bg-orange-700 active:scale-95 cursor-pointer"}`}>
                    {"Setting"}
                </button>
            </div>

            {isSettingsOpen && (
                <div className="absolute top-20 m-4 p-4 gap-1 bg-orange-500 text-white rounded-xl z-20 flex flex-col">
                    <div className="flex gap-5">
                        <div>
                            <label>
                                <input
                                    className ="mr-2"
                                    type="checkbox"
                                    checked={isGridVisible}
                                    onChange={handleGridToggle}
                                />
                                Show Grid
                            </label>
                        </div>
                        <div>
                            <label>
                                <input
                                    className ="mr-2"
                                    type="checkbox"
                                    checked={isFacesVisible}
                                    onChange={handleFacesToggle}
                                />
                                Show Faces
                            </label>
                        </div>
                    </div>
                    <div>
                        <label>
                            Bloom Strength:
                            <input 
                                className="ml-2"
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={bloomStrength}
                                onChange={handleBloomStrengthChange} 
                            />
                        </label>
                    </div>

                    <div>
                        <label>
                            Bloom Radius:
                            <input
                                className="ml-2"
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={bloomRadius}
                                onChange={handleBloomRadiusChange} 
                            />
                        </label>
                    </div>

                    <div>
                        <label>
                            Bloom Threshold:
                            <input
                                className="ml-2"
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={bloomThreshold}
                                onChange={handleBloomThresholdChange} 
                            />
                        </label>
                    </div>

                    
                    <button onClick={toggleSettingsPopup} style={{ marginTop: "20px" }}>
                        Close
                    </button>
                </div>
            )}

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
