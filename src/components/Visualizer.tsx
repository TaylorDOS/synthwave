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

        // 🎨 Three.js Scene Setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current.appendChild(renderer.domElement);

        // 🎬 Create frequency cubes
        const createCube = (color: number, x: number) => {
            const geometry = new THREE.BoxGeometry();
            const material = new THREE.MeshBasicMaterial({ color });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.x = x;
            scene.add(cube);
            return cube;
        };

        const cubeLow = createCube(0xff0000, -2); // Bass (Red)
        const cubeMid = createCube(0x00ff00, 0);  // Mid (Green)
        const cubeHigh = createCube(0x0000ff, 2); // Treble (Blue)

        // 🎬 Animation Loop
        const animate = () => {
            requestAnimationFrame(animate);
            if (analyserRef.current) {
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);

                const bass = dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10 / 255;
                const mid = dataArray.slice(20, 40).reduce((a, b) => a + b, 0) / 20 / 255;
                const treble = dataArray.slice(60, 100).reduce((a, b) => a + b, 0) / 40 / 255;

                cubeLow.scale.y = 1 + bass * 5;
                cubeMid.scale.y = 1 + mid * 5;
                cubeHigh.scale.y = 1 + treble * 5;
            }

            renderer.render(scene, camera);
        };
        animate();

        return () => {
            mountRef.current?.removeChild(renderer.domElement);
        };
    }, []);

    // 🎵 Handle Play/Pause Button Click
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

    // 🔊 Load Selected Audio File & Connect to Web Audio API
    const loadAudioFile = (file: File) => {
        setAudioFile(file);

        const objectURL = URL.createObjectURL(file);

        if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.crossOrigin = "anonymous";
        }

        audioRef.current.src = objectURL;
        audioRef.current.load();

        // 🛠 Reconnect Web Audio API
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
                <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-40 flex items-center justify-center text-gray-300 text-lg border-2 border-dashed border-gray-500 rounded-lg p-6">
                    Drag & Drop an Audio File Here
                </div>
            )}

            {/* Three.js Scene */}
            <div ref={mountRef} className="flex-1 w-full"></div>
        </div>
    );
}