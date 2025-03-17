"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export default function Renderer() {
    const mountRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        // Create Scene
        const scene = new THREE.Scene();
        const gridHelper = new THREE.GridHelper(10, 10);
        scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(5);
        scene.add(axesHelper);

        // Create Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        mountRef.current.appendChild(renderer.domElement);

        // Create Camera
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 0, 10);

        // Add OrbitControls for rotation
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; // Smooth rotation
        controls.dampingFactor = 0.05;
        controls.rotateSpeed = 0.5;
        controls.enableZoom = true; // Allow zooming
        controls.enablePan = true; // Allow panning (moving camera)
        controls.maxPolarAngle = Math.PI / 2;

        // Add Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 5);
        scene.add(directionalLight);

        const composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0;
        bloomPass.strength = 1.5; // Bloom intensity
        bloomPass.radius = 0.5;
        composer.addPass(bloomPass);

        // Load DeLorean Model
        const loader = new GLTFLoader();
        loader.load("/models/delorean.gltf", (gltf) => {
            const model = gltf.scene;
            model.position.set(0, -1, 12);
            model.scale.set(1, 1, 1);
            scene.add(model);
        }, undefined, (error) => {
            console.error("Error loading DeLorean model:", error);
        });

        // Camera Movement with WASD keys
        const keys: Record<string, boolean> = { w: false, a: false, s: false, d: false };
        const speed = 0.2;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (keys.hasOwnProperty(event.key)) keys[event.key] = true;
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (keys.hasOwnProperty(event.key)) keys[event.key] = false;
        };

        const moveCamera = () => {
            if (keys.w) camera.position.z -= speed;
            if (keys.s) camera.position.z += speed;
            if (keys.a) camera.position.x -= speed;
            if (keys.d) camera.position.x += speed;
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        // Animation Loop
        const animate = () => {
            requestAnimationFrame(animate);
            moveCamera();
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Handle Window Resize
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            mountRef.current?.removeChild(renderer.domElement);
        };
    }, []);

    return <div ref={mountRef} className="w-full h-screen" />;
}
