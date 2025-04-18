"use client"
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const CarVisualizer: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const carModels = useRef<THREE.Object3D[]>([]);
  const carRef = useRef<THREE.Object3D | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [currentCarIndex, setCurrentCarIndex] = useState(0);

  const carPaths = [
    "/models/delorean/scene.gltf",
    "/models/muscle/scene.gltf",
    "/models/cyber/scene.gltf",
  ];

  const carScales = [
    new THREE.Vector3(2, 2, 2), // DeLorean
    new THREE.Vector3(1, 1, 1), // Muscle
    new THREE.Vector3(2, 2, 2), // Cyber
  ];

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let controls: OrbitControls | null = null;

    const init = () => {
      if (!mountRef.current) return;

      // Set up renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      mountRef.current.appendChild(renderer.domElement);

      // Set up scene
      sceneRef.current = new THREE.Scene();
      sceneRef.current.background = new THREE.Color(0x0f0f1c);

      // Set up camera
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 20, 100);

      // Set up controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.rotateSpeed = 0.5;
      controls.enableZoom = true;
      controls.minDistance = 5;
      controls.maxDistance = 50;
      controls.enablePan = true;
      controls.maxPolarAngle = Math.PI / 2;

      // Add lighting
      const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
      directionalLight.position.set(5, 10, 5);
      sceneRef.current.add(directionalLight);

      // Load car models
      const loader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("/examples/jsm/libs/draco/");
      loader.setDRACOLoader(dracoLoader);

      carPaths.forEach((path, index) => {
        loader.load(
          path,
          (gltf) => {
            const model = gltf.scene;
            model.userData.initialPosition = new THREE.Vector3(0, 0, 0);
            model.position.copy(model.userData.initialPosition);
            model.rotation.y = Math.PI;
            model.scale.copy(carScales[index]);

            carModels.current[index] = model;

            if (index === 0 && sceneRef.current) {
              sceneRef.current.add(model);
              carRef.current = model;
            }
          },
          undefined,
          (error) => {
            console.error(`Error loading car model at ${path}:`, error);
          }
        );
      });

      const animate = () => {
        if (controls) controls.update();
        if (renderer && sceneRef.current && camera) {
          renderer.render(sceneRef.current, camera);
        }
        requestAnimationFrame(animate);
      };
      animate();

      const handleResize = () => {
        if (camera && renderer) {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        }
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
        }
        if (mountRef.current && renderer?.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    };

    init();
  }, []);

  const switchCar = (index: number) => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!carModels.current[index]) {
      console.error(`Car model at index ${index} is not loaded yet.`);
      return;
    }

    if (carRef.current) {
      scene.remove(carRef.current);
    }

    const newCar = carModels.current[index];
    scene.add(newCar);
    carRef.current = newCar;
    setCurrentCarIndex(index);
  };

  return (
    <div className="w-screen h-screen relative">
      <div ref={mountRef} className="absolute inset-0"></div>
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        <button
          onClick={() => switchCar(0)}
          className={`p-2 text-white bg-gray-600 hover:bg-pink-700 rounded shadow-md ${
            currentCarIndex === 0 ? "bg-pink-700" : ""
          }`}
        >
          DeLorean
        </button>
        <button
          onClick={() => switchCar(1)}
          className={`p-2 text-white bg-gray-600 hover:bg-pink-700 rounded shadow-md ${
            currentCarIndex === 1 ? "bg-pink-700" : ""
          }`}
        >
          Muscle
        </button>
        <button
          onClick={() => switchCar(2)}
          className={`p-2 text-white bg-gray-600 hover:bg-pink-700 rounded shadow-md ${
            currentCarIndex === 2 ? "bg-pink-700" : ""
          }`}
        >
          Cyber
        </button>
      </div>
    </div>
  );
};

export default CarVisualizer;