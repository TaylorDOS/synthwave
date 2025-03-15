"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function Visualizer() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const mountRef = useRef<HTMLDivElement | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        // Set up scene
        const scene = new THREE.Scene();

        // Set up renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current.appendChild(renderer.domElement);

        // Set up camera
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, -60, 10);
        camera.rotation.x = Math.PI / 2;

        // Plane settings
        const width = 300;
        const height = 100;
        const widthSegments = 30;
        const heightSegments = 30;
        const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
        
        // Set material to allow vertex colors
        const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });
        const plane = new THREE.Mesh(geometry, material);
        scene.add(plane);

        // Set up vertex colors
        const position = geometry.attributes.position;
        const colors = [];
        const vertexCount = position.count;

        for (let i = 0; i < vertexCount; i++) {
            const z = position.getZ(i);
            // Map the z value to a color (from blue to red)
            const color = new THREE.Color();
            color.setHSL((z + 50) / 100, 1, 0.5); // Adjust color based on z
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

        // Animation Loop
        const animate = () => {
            requestAnimationFrame(animate);

            if (analyserRef.current) {
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);

                const position = geometry.attributes.position;
                const colorAttr = geometry.attributes.color;
                const vertexCount = position.count;

                // Define the Z range for color mapping (customizable)
                const minZ = 0;
                const maxZ = 30;  
                const zRange = maxZ - minZ;

                // Interpolation speed for height change (smoother transitions)
                const interpolationSpeed = 0.03;

                for (let i = 0; i < vertexCount; i++) {
                    const x = position.getX(i);
                    const y = position.getY(i);
                    let z = position.getZ(i);

                    // Normalize Z value between 0 and 1
                    const normalizedZ = THREE.MathUtils.clamp((z - minZ) / zRange, 0, 1);

                    // Set HSL color (Blue -> Red Gradient)
                    const color = new THREE.Color();
                    color.setHSL(0.7 - normalizedZ * 0.7, 1, 0.5); // Hue shifts from 0.7 (blue) to 0.0 (red)

                    // Apply color to vertex
                    colorAttr.setXYZ(i, color.r, color.g, color.b);

                    // Section-based movement logic
                    let heightOffset = 0;
                    const adjustedX = x + width / 3;
                    let col = 0;

                    const columnWidth = width / 4;
                    const column2Width = width / 8;

                    if (adjustedX < columnWidth) {
                        col = 0;
                    } else if (adjustedX < columnWidth + column2Width) {
                        col = 1;
                    } else {
                        col = 2;
                    }

                    const row = Math.floor((y + height / 2) / (height / 3));

                    if (row === 2 && col !== 1) {
                        heightOffset = (dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10) / 255 * 5;
                        const randomMovement = Math.random() * 16;
                        z += (heightOffset * randomMovement - z) * interpolationSpeed;
                    } 
                    else if (row === 1 && col !== 1) {
                        heightOffset = (dataArray.slice(60, 100).reduce((a, b) => a + b, 0) / 40) / 255 * 5;
                        const randomMovement = Math.random() * 14;
                        z += (heightOffset * randomMovement - z) * interpolationSpeed;
                    }  
                    else if (row === 0 && col !== 1) {
                        heightOffset = (dataArray.slice(20, 40).reduce((a, b) => a + b, 0) / 20) / 255 * 5;
                        const randomMovement = Math.random() * 2;
                        z += (heightOffset * randomMovement - z) * interpolationSpeed;
                    }

                    // Update the Z position of the vertex
                    position.setZ(i, z);


                    // Common -y direction movement
                    position.setY(i, y - 0.1);

                    // If y position goes below -50, reset to 50
                    if (position.getY(i) < -50) {
                        position.setY(i, 50);
                    }

                    if (position.getY(i) >= 47) {
                        position.setZ(i, 0);
                    }
                }

                // Mark geometry as updated
                position.needsUpdate = true;
                colorAttr.needsUpdate = true;
            }

            renderer.render(scene, camera);
        };
        animate();

        return () => {
            mountRef.current?.removeChild(renderer.domElement);
        };


        return () => {
            mountRef.current?.removeChild(renderer.domElement);
        };
    }, []);

    // Handle Play/Pause Button
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

    // Load Audio File
    const loadAudioFile = (file: File) => {
        setAudioFile(file);
        const objectURL = URL.createObjectURL(file);
        
        if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.crossOrigin = "anonymous";
        }
        audioRef.current.src = objectURL;
        audioRef.current.load();

        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
        }

        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
    };

    // 🎶 Handle File Upload
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) loadAudioFile(file);
    };

    // 🎵 Handle Drag & Drop
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
        <div className="flex flex-col items-center h-screen bg-black" onDragOver={handleDragOver} onDrop={handleDrop}>
            {/* Upload File Button */}
            <label className="fixed top-5 px-6 py-3 text-lg font-bold text-white bg-blue-600 rounded-md shadow-lg cursor-pointer transition duration-300 hover:bg-blue-700">
                Upload Music
                <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
            </label>

            {/* Play Button */}
            {audioFile && (
                <button
                    onClick={handlePlayPause}
                    className="fixed top-20 px-6 py-3 text-lg font-bold text-white bg-pink-600 rounded-md shadow-lg transition duration-300 hover:bg-pink-700 active:scale-95"
                >
                    {isPlaying ? "Pause Music" : "Play Music"}
                </button>
            )}

            {/* Drag & Drop Area */}
            {!audioFile && (
                <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-40 flex items-center justify-center text-gray-300 text-lg border-2 border-dashed border-gray-500 rounded-lg p-6">
                    Drag & Drop an Audio File Here
                </div>
            )}

            {/* Three.js Scene */}
            <div ref={mountRef} className="flex-1 w-full"></div>
        </div>
    );
}
