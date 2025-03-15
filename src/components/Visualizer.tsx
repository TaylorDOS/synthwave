"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function Visualizer() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [frequencyData, setFrequencyData] = useState<{ label: string; value: number }[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const mountRef = useRef<HTMLDivElement | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const cubesRef = useRef<THREE.Mesh[]>([]);

    useEffect(() => {
        if (!mountRef.current) return;
        const scene = new THREE.Scene();
        const cameraSize = 10;
        const aspectRatio = window.innerWidth / window.innerHeight;
        const camera = new THREE.OrthographicCamera(
            -cameraSize * aspectRatio, // left
            cameraSize * aspectRatio,  // right
            cameraSize, // top
            -cameraSize, // bottom
            0.1, // near
            1000 // far
        );
        camera.position.z = 15;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.top = "0";
        renderer.domElement.style.left = "0";
        renderer.domElement.style.zIndex = "-1";
        mountRef.current.appendChild(renderer.domElement);

        const numCubes = 7;
        const spacing = 2;
        cubesRef.current = [];

        for (let i = 0; i < numCubes; i++) {
            const geometry = new THREE.BoxGeometry(1.5, 1, 1); // Width, height, depth
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(i * spacing - (numCubes * spacing) / 2, 0, 0);
            scene.add(cube);
            cubesRef.current.push(cube);
        }

        // Animation Loop
        const animate = () => {
            requestAnimationFrame(animate);

            if (analyserRef.current) {
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);

                const subBass = averageFrequency(dataArray, 0, 1);   // 20-60 Hz (2 bins)
                const bass = averageFrequency(dataArray, 2, 4);      // 60-250 Hz (3 bins)
                const lowMid = averageFrequency(dataArray, 5, 8);    // 250-500 Hz (4 bins)
                const mid = averageFrequency(dataArray, 9, 14);      // 500-2000 Hz (6 bins)
                const upperMid = averageFrequency(dataArray, 15, 19); // 2000-4000 Hz (5 bins)
                const treble = averageFrequency(dataArray, 20, 24);  // 4000-6000 Hz (5 bins)
                const highTreble = averageFrequency(dataArray, 25, 31); // 6000-20000 Hz (7 bins)
                const scaleFactors = [subBass, bass, lowMid, mid, upperMid, treble, highTreble];

                // Update Cube Scaling
                cubesRef.current.forEach((cube, index) => {
                    const scaleValue = scaleFactors[index] || 0; // Get corresponding frequency band value
                    cube.scale.y = 1 + scaleValue * 5; // Scale based on frequency intensity
                });

                setFrequencyData([
                    { label: "Sub-Bass", value: subBass },
                    { label: "Bass", value: bass },
                    { label: "Low Mid", value: lowMid },
                    { label: "Mid", value: mid },
                    { label: "Upper Mid", value: upperMid },
                    { label: "Treble", value: treble },
                    { label: "High Treble", value: highTreble },
                ]);
            }

            renderer.render(scene, camera);
        };
        animate();

        const averageFrequency = (dataArray: Uint8Array, start: number, end: number) => {
            const values = dataArray.slice(start, end + 1);
            const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            return avg / 255;
        };

        const handleResize = () => {
            const newAspectRatio = window.innerWidth / window.innerHeight;
            camera.left = -cameraSize * newAspectRatio;
            camera.right = cameraSize * newAspectRatio;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            mountRef.current?.removeChild(renderer.domElement);
        };
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
        <div className="w-screen flex flex-col justify-center items-center bg-gradient-to-b from-blue-600 to-transparent gap-4 " onDragOver={handleDragOver} onDrop={handleDrop}>
            <h1 className="text-2xl font-bold text-white mt-16">
                Synthwave Music Player
            </h1>
            <p className="text-white text-sm">
                Drag and drop an audio file
            </p>
            <div className="flex flex-row items-center gap-4">
                <label className="relative text-md px-6 py-3 font-bold text-white bg-blue-600 rounded-md shadow-lg cursor-pointer transition duration-300 hover:bg-blue-700">
                    Upload
                    <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                </label>
                <button
                    onClick={handlePlayPause}
                    disabled={!audioFile}
                    className={`px-6 py-3 text-md font-bold rounded-md shadow-lg transition duration-300 ${audioFile
                        ? "text-white bg-pink-600 hover:bg-pink-700 active:scale-95 cursor-pointer"
                        : "text-gray-400 bg-gray-600 cursor-not-allowed"
                        }`}
                >
                    {isPlaying ? "Pause" : "Play"}
                </button>
            </div>

            <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white p-4 rounded-lg max-w-4xl w-full overflow-y-auto max-h-60 flex flex-col items-center">
                <h3 className="text-center text-lg font-bold mb-2">Equalizer Data</h3>
                <ul className="list-none text-sm flex flex-row w-full space-x-2">
                    {frequencyData.map((band, index) => (
                        <li key={index} className="flex flex-col p-2 bg-gray-700 rounded-md w-full text-center">
                            <span className="font-bold">{band.label}</span>
                            <span className="text-blue-400 items-end justify-end">{band.value.toFixed(2)}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div ref={mountRef} className="flex w-full"></div>
        </div>
    );
}