import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';

// === LOADING SCREEN FUNCTIONS ===
function updateLoadingProgress(progress) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    if (progressBar && progressText) {
        progressBar.style.width = progress + '%';
        progressText.textContent = Math.round(progress) + '%';
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        // Xóa loading screen sau khi animation hoàn thành
        setTimeout(() => {
            loadingScreen.remove();
        }, 500);
    }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(2, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Mặc định chọn AgX (Chuẩn Blender 4.0)
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;

document.body.appendChild(renderer.domElement);

// --- RAYCASTER CHO CLICK DETECTION ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// --- MÔI TRƯỜNG ---
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;

// Đèn mặt trời
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

// --- LOAD MODEL WITH PROGRESS ---
const loader = new GLTFLoader();
let loadedModel = null;
let clickableObjects = [];

// Loading Manager để track progress
const loadingManager = new THREE.LoadingManager();

loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
    const progress = (itemsLoaded / itemsTotal) * 100;
    updateLoadingProgress(progress);
};

loadingManager.onLoad = function() {
    console.log('Tất cả resources đã load xong!');
    // Delay một chút để người dùng thấy 100%
    setTimeout(() => {
        hideLoadingScreen();
    }, 500);
};

// Sử dụng loading manager
const loaderWithProgress = new GLTFLoader(loadingManager);

loaderWithProgress.load('scene.glb', 
    function (gltf) {
        loadedModel = gltf.scene;

        loadedModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material.map) child.material.map.anisotropy = 16;

                // Lưu lại màu gốc để reset nếu cần
                if (child.material.color) {
                    child.userData.originalColor = child.material.color.clone();
                }

                // Thêm vào mảng clickable objects
                clickableObjects.push(child);
            }
        });

        scene.add(loadedModel);

        // Căn giữa
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        controls.target.copy(center);
        camera.lookAt(center);

    }, 
    function (progress) {
        // Progress callback cho file cụ thể
        if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            updateLoadingProgress(percentComplete);
        }
    }, 
    function (error) { 
        console.error(error);
        // Ẩn loading screen ngay cả khi có lỗi
        hideLoadingScreen();
    }
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- CLICK EVENT HANDLER ---
function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, false);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        const objectName = clickedObject.name || 'Unnamed Object';
        console.log(`Đã click vào [${objectName}]`);
        highlightObject(clickedObject);
    }
}

// --- HIGHLIGHT EFFECT KHI CLICK ---
let previouslyHighlighted = null;

function highlightObject(object) {
    if (previouslyHighlighted && previouslyHighlighted.userData.originalColor) {
        previouslyHighlighted.material.color.copy(previouslyHighlighted.userData.originalColor);
    }

    if (object.material.color && object.userData.originalColor) {
        object.material.color.setHex(0xff6b6b);
        previouslyHighlighted = object;

        setTimeout(() => {
            if (object.userData.originalColor) {
                object.material.color.copy(object.userData.originalColor);
            }
            previouslyHighlighted = null;
        }, 1000);
    }
}

window.addEventListener('click', onMouseClick, false);

// --- BẢNG ĐIỀU KHIỂN NÂNG CAO ---
const gui = new GUI({ title: 'Linh thử chỉnh preset nào okela nhất ' });

const params = {
    toneMapping: 'AgX (Blender 4.0)',
    exposure: 1.0,
    envIntensity: 1.0,
    saturation: 1.0,
    contrast: 1.0
};

const toneMappingOptions = {
    'No ToneMapping (Gắt & Cháy)': THREE.NoToneMapping,
    'Linear (Nhạt & Thật)': THREE.LinearToneMapping,
    'Reinhard (Cân bằng)': THREE.ReinhardToneMapping,
    'Cineon (Điện ảnh cũ)': THREE.CineonToneMapping,
    'ACESFilmic (Dịu & Bạc màu)': THREE.ACESFilmicToneMapping,
    'AgX (Chuẩn Blender mới)': THREE.AgXToneMapping,
    'Neutral (Chuẩn Khronos)': THREE.NeutralToneMapping
};

gui.add(params, 'toneMapping', Object.keys(toneMappingOptions)).onChange(val => {
    renderer.toneMapping = toneMappingOptions[val];
    scene.traverse(obj => { if (obj.material) obj.material.needsUpdate = true; });
});

gui.add(params, 'exposure', 0, 3.0).name('Độ phơi sáng').onChange(val => {
    renderer.toneMappingExposure = val;
});

gui.add(params, 'envIntensity', 0, 5.0).name('Đèn môi trường').onChange(val => {
    scene.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.envMapIntensity = val;
        }
    });
});

const colorFolder = gui.addFolder('Chỉnh màu vật liệu');

colorFolder.add(params, 'saturation', 0, 2.0).name('Độ rực (Saturate)').onChange(val => {
    if (!loadedModel) return;
    loadedModel.traverse(child => {
        if (child.isMesh && child.material && child.userData.originalColor) {
            const col = child.userData.originalColor.clone();
            col.multiplyScalar(val);
            child.material.color.copy(col);
        }
    });
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});