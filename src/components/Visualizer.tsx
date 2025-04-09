"use client";

import { useEffect, useRef, useState } from "react";
import { FaPlay, FaPause, FaForward, FaBackward, FaMusic, FaTimes, FaUpload } from "react-icons/fa";
import * as THREE from "three";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createNoise2D } from 'simplex-noise';

export default function Visualizer() {
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

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isGridVisible, setIsGridVisible] = useState(true);
    const [isFacesVisible, setIsFacesVisible] = useState(true);
    let [bloomStrength, setBloomStrength] = useState(0.3);
    const [tempBloomStrength, setTempBloomStrength] = useState(bloomStrength);
    let [bloomRadius, setBloomRadius] = useState(0.2);
    const [tempBloomRadius, setTempBloomRadius] = useState(bloomRadius);
    let [bloomThreshold, setBloomThreshold] = useState(0.5);
    const [tempBloomThreshold, setTempBloomThreshold] = useState(bloomThreshold);

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
            

            if (!bloomStrength || !bloomRadius || !bloomThreshold) {
                setBloomStrength(0.3); 
                setBloomRadius(0.2);
                setBloomThreshold(0);
            }


            // Set up Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true });
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

            const particles = new THREE.Points(particleGeometry, particleMaterial);
            scene.add(particles);

            //background of the stars
            scene.background = new THREE.Color(0x0f0f1c);
            renderer.setClearColor(new THREE.Color(0x0f0f1c), 1);
            
            //camera setup
            const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 20, 100);

            //camera controls
            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.rotateSpeed = 0.5;
            controls.enableZoom = true; // Allow zooming
            controls.minDistance = 5; 
            controls.maxDistance = 50;
            controls.enablePan = true; // Allow panning (moving camera)

            // controls.enableZoom = true;
            // controls.enablePan = true;
            controls.maxPolarAngle = Math.PI / 2;

            // Add Lighting
            // const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            // scene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(5, 10, 5);
            scene.add(directionalLight);

            //bloom effect setup
            const composer = new EffectComposer(renderer);
            const renderPass = new RenderPass(scene, camera);
            composer.addPass(renderPass);

            if (!bloomPassRef.current) {
                const bloomPass = new UnrealBloomPass(
                    new THREE.Vector2(window.innerWidth, window.innerHeight),
                    bloomStrength, 
                    bloomRadius, 
                    bloomThreshold
                  );
                  bloomPassRef.current = bloomPass;
                  composer.addPass(bloomPass);
            } else {
                // Update bloom effect dynamically
                bloomPassRef.current.strength = bloomStrength;
                bloomPassRef.current.radius = bloomRadius;
                bloomPassRef.current.threshold = bloomThreshold;
            }
            // const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
            // bloomPass.threshold = 0;
            // bloomPass.strength = 1.0;
            // bloomPass.radius = 0.5;
            // composer.addPass(bloomPass);

            const loader = new GLTFLoader();
            loader.load("/models/carModel.gltf", (gltf) => {
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
                // requestAnimationFrame(animate);

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

                        // carRef.current.rotation.y = THREE.MathUtils.lerp(
                        //     carRef.current.rotation.y,
                        //     originalPos.y - subBass * 12 + bass * 8, // Car movement in x axis
                        //     0.04 // Increased interpolation speed (was 0.01, now 0.02)
                        // );
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

                particles.rotation.y += 0.0005;

                //renderer.render(scene, camera);
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
                mountRef.current?.removeChild(renderer!.domElement);
                if (gridRef.current) scene.remove(gridRef.current);
                if (facesRef.current) scene.remove(facesRef.current);
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
        setIsFacesVisible(e.target.checked);
        if (facesRef.current) {
            facesRef.current.visible = e.target.checked;
        }
    };

    // Handle temporary changes
    const handleBloomStrengthTempChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTempBloomStrength(parseFloat(e.target.value));
    };

    const handleBloomRadiusTempChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTempBloomRadius(parseFloat(e.target.value));
    };

    const handleBloomThresholdTempChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTempBloomThreshold(parseFloat(e.target.value));
    };

    // Handle final changes (on mouse up)
    const handleBloomStrengthChange = () => {
        setBloomStrength(tempBloomStrength);
    };

    const handleBloomRadiusChange = () => {
        setBloomRadius(tempBloomRadius);
    };

    const handleBloomThresholdChange = () => {
        setBloomThreshold(tempBloomThreshold);
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

            <div className="absolute top-12 flex flex-col items-center p-4 rounded-xl shadow-lg">
                <button
                    onClick={toggleSettingsPopup}
                    className={`px-6 py-3 text-md font-bold rounded-md shadow-lg transition duration-300 text-white bg-orange-600 hover:bg-orange-700 active:scale-95 cursor-pointer"}`}>
                    {"Setting"}
                </button>
            </div>

            {isSettingsOpen && (
                <div className="absolute top-26 m-4 p-4 gap-1 bg-orange-500 text-white rounded-xl z-20 flex flex-col">
                    <div className="flex gap-5">
                        <div>
                            <label>
                                Show Grid
                                <input
                                    className ="mr-2"
                                    type="checkbox"
                                    checked={isGridVisible}
                                    onChange={handleGridToggle}
                                />
                            </label>
                        </div>
                        <div>
                            <label>
                                Show Faces
                                <input
                                    className ="mr-2"
                                    type="checkbox"
                                    checked={isFacesVisible}
                                    onChange={handleFacesToggle}
                                />
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
                                value={tempBloomStrength}
                                onChange={handleBloomStrengthTempChange}
                                onMouseUp={handleBloomStrengthChange}
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
                                value={tempBloomRadius}
                                onChange={handleBloomRadiusTempChange}
                                onMouseUp={handleBloomRadiusChange}
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
                                value={tempBloomThreshold}
                                onChange={handleBloomThresholdTempChange}
                                onMouseUp={handleBloomThresholdChange}
                            />
                        </label>
                    </div>

                    <button onClick={toggleSettingsPopup} style={{ marginTop: "20px" }}>
                        Close
                    </button>
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
