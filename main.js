import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
// GUI removed
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';


// === LOADING SCREEN FUNCTIONS ===
function updateLoadingProgress(progress) {
    const progressBar = document.getElementById('progress-bar');
    
    if (progressBar) {
        progressBar.style.width = progress + '%';
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

let loadingCompleted = false;

function completeLoadingProgress() {
    if (loadingCompleted) return;
    loadingCompleted = true;
    updateLoadingProgress(100);
    setTimeout(() => {
        hideLoadingScreen();
    }, 500);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);
scene.environmentIntensity = 0.3; // bắt đầu tối, sẽ animate lên khi click note_paper

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// initial default view
camera.position.set(4.3, 3.7, 4.15);

// save default camera presets so we can transition back later
const defaultCamPos = camera.position.clone();
let defaultCamTarget = new THREE.Vector3(); // filled once controls.target initialized later

// thêm camera thứ hai và quản lý camera đang hoạt động
const camera2 = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera2.position.set(-2, 2, 5);

// helper để dễ hình dung vị trí camera 2
const camera2Helper = new THREE.CameraHelper(camera2);
scene.add(camera2Helper);
camera2Helper.visible = false; // ẩn mặc định

let activeCamera = camera; // camera đang được sử dụng để render và raycast

// --- Adaptive quality profile cho mobile/iOS để tránh crash do quá tải GPU/RAM ---
const userAgent = navigator.userAgent || '';
const isIOS = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
    || window.matchMedia('(pointer: coarse)').matches;
const isLowQualityDevice = isIOS || isMobile;

const qualityProfile = {
    antialias: !isLowQualityDevice,
    pixelRatio: isIOS ? 1 : (isMobile ? 1.25 : Math.min(window.devicePixelRatio, 2)),
    enableShadows: !isLowQualityDevice,
    maxAnisotropy: isLowQualityDevice ? 2 : 16,
    useEXREnvironment: !isLowQualityDevice,
    powerPreference: isLowQualityDevice ? 'default' : 'high-performance'
};
const isAggressiveMemorySave = isLowQualityDevice;

console.log('Quality profile:', {
    isIOS,
    isMobile,
    antialias: qualityProfile.antialias,
    pixelRatio: qualityProfile.pixelRatio,
    enableShadows: qualityProfile.enableShadows,
    maxAnisotropy: qualityProfile.maxAnisotropy,
    useEXREnvironment: qualityProfile.useEXREnvironment
});

const renderer = new THREE.WebGLRenderer({
    antialias: qualityProfile.antialias,
    powerPreference: qualityProfile.powerPreference
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(qualityProfile.pixelRatio);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = qualityProfile.enableShadows;
if (qualityProfile.enableShadows) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

const deviceMaxAnisotropy = renderer.capabilities.getMaxAnisotropy();
const targetAnisotropy = Math.min(qualityProfile.maxAnisotropy, deviceMaxAnisotropy);

// Mặc định chọn AgX (Chuẩn Blender 4.0)
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.5;

document.body.appendChild(renderer.domElement);

// --- Saturation mặc định ---
renderer.domElement.style.filter = 'saturate(0.6)';

// status overlay showing active camera position
// const camStatus = document.createElement('div');
// camStatus.style.position = 'fixed';
// camStatus.style.top = '100px';
// camStatus.style.right = '10px';
// camStatus.style.padding = '4px 8px';
// camStatus.style.background = 'rgba(0,0,0,0.5)';
// camStatus.style.color = 'white';
// camStatus.style.fontFamily = 'monospace';
// camStatus.style.fontSize = '12px';
// camStatus.style.zIndex = '200';
// document.body.appendChild(camStatus);

// --- RAYCASTER CHO CLICK DETECTION ---
const raycaster = new THREE.Raycaster();

// create return-to-default button
const returnBtn = document.createElement('button');
returnBtn.textContent = 'View default';
returnBtn.style.position = 'fixed';
returnBtn.style.bottom = '10px';
returnBtn.style.left = '10px';
returnBtn.style.padding = '6px 10px';
returnBtn.style.zIndex = '100';
returnBtn.style.setProperty('z-index', '99', 'important');
document.body.appendChild(returnBtn);
returnBtn.addEventListener('click', returnToDefaultCamera);

window.addEventListener('message', function(event) {
    // Nếu nhận được đúng "mật khẩu" từ Webflow
    if (event.data === 'trigger_return_default') {
        console.log("3D Scene: Nhận lệnh từ Webflow, đang quay về camera mặc định...");
        
        // GỌI THẲNG HÀM NÀY, KHÔNG CẦN TÌM THEO ID NỮA
        if (typeof returnToDefaultCamera === 'function') {
            returnToDefaultCamera();
        }
        
        // Hoặc bạn cũng có thể gọi: returnBtn.click();
    }
});

const mouse = new THREE.Vector2();

// helper to smoothly return view to default camera over 2 seconds
function returnToDefaultCamera() {
    // copy current active camera pos/rot into camera so animation is visible
    camera.position.copy(activeCamera.position);
    camera.rotation.copy(activeCamera.rotation);
    // ensure controls target represents current view -- if activeCamera isn't camera
    // we approximate by keeping existing controls.target
    activeCamera = camera;

    // animate back to defaults
    gsap.to(camera.position, {
        x: defaultCamPos.x,
        y: defaultCamPos.y,
        z: defaultCamPos.z,
        duration: 2,
        ease: 'power2.inOut'
    });
    const tgt = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
    gsap.to(tgt, {
        x: defaultCamTarget.x,
        y: defaultCamTarget.y,
        z: defaultCamTarget.z,
        duration: 2,
        ease: 'power2.inOut',
        onUpdate: () => {
            controls.target.set(tgt.x, tgt.y, tgt.z);
        }
    });
}
// định nghĩa hành vi khi click vào một số object cụ thể
// bạn có thể sửa lại vị trí cameraPos và lookAt theo ý muốn
const clickActions = {
    TV_1: {
        // camera sẽ di chuyển đến tọa độ này
        cameraPos: new THREE.Vector3(-1.4, 1.6, 0.4),
        // nếu không muốn dùng center của object, gán một Vector3 khác
        lookAt: null,
        // dữ liệu sẽ gửi qua postMessage
        message: 'TV_1'
    },
    note_paper: {
        cameraPos: new THREE.Vector3(1.2, 1.5, 1),
        lookAt: null,     // nhìn vào trung tâm của object
        message: 'click_note_paper' // match existing Webflow postMessage
    },
    Radio: {
        cameraPos: new THREE.Vector3(-1.7, 1.7, -0.5),
        lookAt: null,     // nhìn vào trung tâm của object
        message: 'Radio'
    },
    anh_giua: {
        cameraPos: new THREE.Vector3(-1, 2.2, 2.5),
        lookAt: null,     // nhìn vào trung tâm của object
        message: 'anh_giua'
    },
    Closed_NewsPaper1_Newspaper_Texture_0_1: {
        cameraPos: new THREE.Vector3(0.2, 1.42, -0.1),
        lookAt: null,     // nhìn vào trung tâm của object
        message: 'Closed_NewsPaper1_Newspaper_Texture_0_1'
    },
    Object_0002: { 
        // click vào xe đạp
        cameraPos: new THREE.Vector3(0.78, 2, -1.35),
        lookAt: null,     // nhìn vào trung tâm của object
        message: 'Object_0002'
    },
    Old_fan004_propeller_0: {
        // click vào quạt
        cameraPos: new THREE.Vector3(-1, 1.9, 1.2),
        lookAt: null,     // nhìn vào trung tâm của object
        message: 'Old_fan004_propeller_0'
    },
    // new unified actions for painting buttons
    but_mau_3001: {
        cameraPos: new THREE.Vector3(2.1, 1, -1),
        lookAt: 'Ve_tuong',
        message: 'Ve_tuong'
    },
    but_mau_4: {
        cameraPos: new THREE.Vector3(2.1, 1, -1),
        lookAt: 'Ve_tuong',
        message: 'Ve_tuong'
    },
    but_mau_1001: {
        cameraPos: new THREE.Vector3(2.1, 1, -1),
        lookAt: 'Ve_tuong',
        message: 'Ve_tuong'
    },
    but_mau_2001: {
        cameraPos: new THREE.Vector3(2.1, 1, -1),
        lookAt: 'Ve_tuong',
        message: 'Ve_tuong'
    },
    Ve_tuong: {
        cameraPos: new THREE.Vector3(2.1, 1, -1),
        lookAt: 'Ve_tuong',
        message: 'Ve_tuong'
    },
    // thêm các mục khác tương tự ở đây
};

// --- MÔI TRƯỜNG ---
// PMREM generator for environment maps
const pmremGenerator = qualityProfile.useEXREnvironment ? new THREE.PMREMGenerator(renderer) : null;
const setRoomEnvironment = () => {
    if (!pmremGenerator) return;
    const roomEnv = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
};

// Try to load an EXR environment map and apply it to the scene.
// If loading fails, fall back to the procedural RoomEnvironment.
if (qualityProfile.useEXREnvironment) {
    const exrLoader = new EXRLoader();
    exrLoader.load(
        'plains_sunset_2k.exr',
        function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            scene.environment = envMap;
            texture.dispose();
            pmremGenerator.dispose();
        },
        undefined,
        function (err) {
            console.warn('Failed to load EXR, using RoomEnvironment fallback', err);
            setRoomEnvironment();
            pmremGenerator.dispose();
        }
    );
} else {
    console.log('Low quality mode: skip EXR + PMREM fallback on mobile/iOS');
    scene.environment = null;
    scene.environmentIntensity = 0;
}

// --- RECTANGLE AREA LIGHT ---
RectAreaLightUniformsLib.init();
const rectLight = new THREE.RectAreaLight(0xffdd00, 24.36, 1.9, 2.01);
rectLight.position.set(0.1, 4.1, -2.3);
rectLight.rotation.set(-1.5, 0, 0);
scene.add(rectLight);

// RectAreaLight khong do shadow dong trong three.js,
// vi vay them mot spotlight an de tang bong do tren nen.
const shadowBoosterTarget = new THREE.Object3D();
shadowBoosterTarget.position.set(0.1, -3, -2.1);
scene.add(shadowBoosterTarget);

const shadowBooster = new THREE.SpotLight(0xffdd00, 50, 40, 1.5, 1, 0.8);
shadowBooster.position.copy(rectLight.position);
shadowBooster.castShadow = qualityProfile.enableShadows;
shadowBooster.target = shadowBoosterTarget;
if (qualityProfile.enableShadows) {
    shadowBooster.shadow.mapSize.set(isLowQualityDevice ? 1024 : 2048, isLowQualityDevice ? 1024 : 2048);
    shadowBooster.shadow.camera.near = 0.5;
    shadowBooster.shadow.camera.far = 40;
    shadowBooster.shadow.bias = 0;
    shadowBooster.shadow.normalBias = 0.04;
    shadowBooster.shadow.radius = 6;
}
scene.add(shadowBooster);

rectLight.power = 103;

// helper kept hidden (no GUI control)
const rectLightHelper = new RectAreaLightHelper(rectLight);
scene.add(rectLightHelper);
rectLightHelper.visible = false;

// --- SPOTLIGHT SÂN KHẤU CHO note_paper ---
const spotLightTarget = new THREE.Object3D();
spotLightTarget.position.set(0.93, 0.55, 0.6); // vị trí mặc định, sẽ cập nhật khi model load
scene.add(spotLightTarget);

const spotLight = new THREE.SpotLight(0xffffff, 73.8, 11.1, 0.08, 0.07, 0.96);
spotLight.position.set(1, 3.5, 1);
spotLight.target = spotLightTarget;
spotLight.castShadow = qualityProfile.enableShadows;
if (qualityProfile.enableShadows) {
    spotLight.shadow.mapSize.set(isLowQualityDevice ? 1024 : 2048, isLowQualityDevice ? 1024 : 2048);
    spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 15;
    spotLight.shadow.bias = -0.001;
    spotLight.shadow.normalBias = 0.03;
    spotLight.shadow.radius = 4;
}
scene.add(spotLight);

const spotLightHelper = new THREE.SpotLightHelper(spotLight);
scene.add(spotLightHelper);
spotLightHelper.visible = false;

// --- TRẠNG THÁI BAN ĐẦU: chỉ SpotLight sáng, RectAreaLight + Env tắt ---
const savedRectIntensity = rectLight.intensity;
const savedShadowBoosterIntensity = shadowBooster.intensity;
rectLight.intensity = 0;
shadowBooster.intensity = 0;
let sceneFullyLit = false;

// --- LOAD MODEL WITH PROGRESS ---
const loader = new GLTFLoader();
let loadedModel = null;
let clickableObjects = [];
// let notePaperMesh = null; // reference for glow effect

// --- IMPORTANT OBJECT CLICK COUNTER ---
const importantObjectNames = [
    'TV_1',
    'note_paper',
    'Radio',
    'anh_giua',
    'Closed_NewsPaper1_Newspaper_Texture_0_1',
    'Object_0002',
    'Old_fan004_propeller_0',
    'Ve_tuong'
];
const clickedImportant = new Set();

const counterEl = document.createElement('div');
counterEl.style.position = 'fixed';
counterEl.style.top = '10px';
counterEl.style.left = '10px';
counterEl.style.padding = '6px 10px';
counterEl.style.background = 'rgba(0, 0, 0, 0)';
counterEl.style.color = 'rgba(0, 0, 0, 0)';
counterEl.style.fontFamily = 'monospace';
counterEl.style.fontSize = '13px';
counterEl.style.zIndex = '300';
counterEl.textContent = `Đã click: 0 / ${importantObjectNames.length}`;
document.body.appendChild(counterEl);

function updateImportantCounter(name) {
    if (!importantObjectNames.includes(name)) return;
    if (clickedImportant.has(name)) return; // đếm duy nhất mỗi object
    
    // 1. Tăng biến đếm
    clickedImportant.add(name);
    counterEl.textContent = `Đã click: ${clickedImportant.size} / ${importantObjectNames.length}`;
    
    // 2. Gửi thông tin ra ngoài Webflow (giữ nguyên)
    try { 
        window.parent.postMessage({ type: 'important_click_count', name, count: clickedImportant.size }, '*'); 
    } catch (e) {}

    // 3. LOGIC TRIGGER TỰ ĐỘNG: Kiểm tra nếu đã đủ 8 vật
    if (clickedImportant.size === importantObjectNames.length) {
        // Kích hoạt animation highlight cửa
        turnOnHighlightCua();
        
        // Gửi thêm một tín hiệu báo "Đã hoàn thành" ra Webflow nếu bạn muốn
        try { 
            window.parent.postMessage({ type: 'all_objects_found' }, '*'); 
        } catch (e) {}
    }
}

// --- HIGHLIGHT BUTTON FOR 'Cua' ---
let cuaHighlighted = false;
const highlightBtn = document.createElement('button');
// highlightBtn.textContent = 'highlight cửa';
// highlightBtn.style.position = 'fixed';
// highlightBtn.style.top = '50px';
// highlightBtn.style.left = '10px';
// highlightBtn.style.padding = '6px 10px';
// highlightBtn.style.zIndex = '305';
// highlightBtn.style.cursor = 'pointer';
// highlightBtn.style.background = '#22222200';
// highlightBtn.style.color = '22222200';
document.body.appendChild(highlightBtn);

function applyHighlightToMesh(mesh) {
    if (!mesh.material) return;
    // skip if this is an outline mesh we created
    if (mesh.userData && mesh.userData._isOutline) return;

    // prevent double-starting
    if (mesh.userData._pulseTween) return;

    // save original material state
    const saveFor = (mat) => {
        if (!mat) return;
        if (!mat.userData._savedHighlight) {
            mat.userData._savedHighlight = {
                color: mat.color ? mat.color.clone() : null,
                emissive: mat.emissive ? mat.emissive.clone() : null,
                emissiveIntensity: mat.emissiveIntensity !== undefined ? mat.emissiveIntensity : null
            };
        }
    };

    if (Array.isArray(mesh.material)) mesh.material.forEach(saveFor);
    else saveFor(mesh.material);

    // create outline mesh
    try {
        if (!mesh.userData._outline) {
            const outlineMat = new THREE.MeshBasicMaterial({ color: 0x6EFF30, side: THREE.BackSide, transparent: true, opacity: 0.9 });
            const outlineMesh = new THREE.Mesh(mesh.geometry.clone(), outlineMat);
            outlineMesh.userData._isOutline = true;
            outlineMesh.scale.set(1.03, 1.03, 1.03);
            outlineMesh.renderOrder = 9999;
            mesh.add(outlineMesh);
            mesh.userData._outline = outlineMesh;
        }
    } catch (e) {
        console.warn('Outline creation failed for', mesh.name, e);
    }

    // pulsing tween object
    const obj = { t: 0 };
    const highlightColor = new THREE.Color(0xffffcc);
    const startPulse = () => {
        mesh.userData._pulseTween = gsap.to(obj, {
            t: 1,
            duration: 0.9,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
            onUpdate: () => {
                try {
                    const applyPulse = (mat) => {
                        if (!mat || !mat.userData || !mat.userData._savedHighlight) return;
                        const saved = mat.userData._savedHighlight;
                        if (mat.emissive && saved.emissive) {
                            mat.emissive.copy(saved.emissive).lerp(highlightColor, obj.t);
                        } else if (mat.color && saved.color) {
                            mat.color.copy(saved.color).lerp(highlightColor, obj.t);
                        }
                        if (mat.emissiveIntensity !== undefined && saved.emissiveIntensity !== null) {
                            mat.emissiveIntensity = THREE.MathUtils.lerp(saved.emissiveIntensity, 0.1, obj.t);
                        }
                        mat.needsUpdate = true;
                    };

                    if (Array.isArray(mesh.material)) mesh.material.forEach(applyPulse);
                    else applyPulse(mesh.material);
                } catch (e) {}
            }
        });
    };

    startPulse();
}

function removeHighlightFromMesh(mesh) {
    if (!mesh.material) return;
    // skip outline meshes (they are removed from their parent)
    if (mesh.userData && mesh.userData._isOutline) return;

    // stop pulse tween if exists
    if (mesh.userData._pulseTween) {
        try { mesh.userData._pulseTween.kill(); } catch (e) {}
        delete mesh.userData._pulseTween;
    }

    // remove outline
    if (mesh.userData._outline) {
        try {
            mesh.userData._outline.geometry.dispose();
            if (mesh.userData._outline.material) mesh.userData._outline.material.dispose();
            mesh.userData._outline.removeFromParent();
        } catch (e) {}
        delete mesh.userData._outline;
    }

    const restore = (mat) => {
        if (!mat || !mat.userData || !mat.userData._savedHighlight) return;
        const saved = mat.userData._savedHighlight;
        if (saved.color && mat.color) mat.color.copy(saved.color);
        if (saved.emissive && mat.emissive) mat.emissive.copy(saved.emissive);
        if (saved.emissiveIntensity !== null && mat.emissiveIntensity !== undefined) mat.emissiveIntensity = saved.emissiveIntensity;
        delete mat.userData._savedHighlight;
        mat.needsUpdate = true;
    };

    if (Array.isArray(mesh.material)) mesh.material.forEach(restore);
    else restore(mesh.material);
}

let TooglecuaHighlighted = false;

function turnOnHighlightCua() {
    const target = scene.getObjectByName('Cua');
    
    if (!target) {
        console.warn('Không tìm thấy object có tên "Cua" để highlight');
        return;
    }
    
    if (!cuaHighlighted) {
        target.traverse((ch) => { 
            if (ch.isMesh) applyHighlightToMesh(ch); 
        });
        cuaHighlighted = true;
        
        // Nếu bạn vẫn giữ nút highlightBtn trên giao diện, cập nhật viền cho nó
        if (typeof highlightBtn !== 'undefined') {
            highlightBtn.style.outline = '2px solid #ffeb99';
        }
        
        console.log("Đã tìm đủ 8 vật - Tự động Highlight Cửa!");
    }
}

// === IndexedDB Cache cho file GLB ===
const GLB_DB_NAME = 'glb_cache';
const GLB_DB_VERSION = 1;
const GLB_STORE_NAME = 'models';
const GLB_FILE_URL = 'scene.glb';
const shouldUseGLBCache = !isAggressiveMemorySave;

function openGLBCache() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(GLB_DB_NAME, GLB_DB_VERSION);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(GLB_STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getCachedGLB(db, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GLB_STORE_NAME, 'readonly');
        const store = tx.objectStore(GLB_STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result); // ArrayBuffer or undefined
        req.onerror = () => reject(req.error);
    });
}

function setCachedGLB(db, key, arrayBuffer) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(GLB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(GLB_STORE_NAME);
        const req = store.put(arrayBuffer, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Loading Manager để track progress
const loadingManager = new THREE.LoadingManager();

// Sử dụng loading manager
const loaderWithProgress = new GLTFLoader(loadingManager);

// Hàm xử lý model sau khi parse xong
function onGLTFLoaded(gltf) {
        loadedModel = gltf.scene;

        const optimizeTextureForMobile = (tex) => {
            if (!tex || !isAggressiveMemorySave) return;
            tex.anisotropy = 1;
            tex.generateMipmaps = false;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
        };

        const optimizeMaterialForMobile = (mat) => {
            if (!mat || !isAggressiveMemorySave) return;
            optimizeTextureForMobile(mat.map);
            optimizeTextureForMobile(mat.normalMap);
            optimizeTextureForMobile(mat.roughnessMap);
            optimizeTextureForMobile(mat.metalnessMap);
            optimizeTextureForMobile(mat.aoMap);
            optimizeTextureForMobile(mat.emissiveMap);
            optimizeTextureForMobile(mat.alphaMap);
        };

        loadedModel.traverse((child) => {
            if (child.isMesh) {

                // Bật shadows cho tất cả mesh
                child.castShadow = qualityProfile.enableShadows;
                child.receiveShadow = qualityProfile.enableShadows;
                
                if (Array.isArray(child.material)) {
                    child.material.forEach((mat) => {
                        if (mat && mat.map) mat.map.anisotropy = targetAnisotropy;
                        optimizeMaterialForMobile(mat);
                    });
                } else if (child.material) {
                    if (child.material.map) child.material.map.anisotropy = targetAnisotropy;
                    optimizeMaterialForMobile(child.material);
                }

                // Lưu lại màu gốc để reset nếu cần
                if (child.material.color) {
                    child.userData.originalColor = child.material.color.clone();
                }

                // // nếu đây là note_paper thì kích hoạt hiệu ứng glow
                // if (child.name === 'note_paper') {
                //     notePaperMesh = child;
                //     // đảm bảo material có thuộc tính emissive
                //     if (!child.material.emissive) {
                //         child.material.emissive = new THREE.Color(0xffff00);
                //     }
                //     child.userData.originalEmissive = child.material.emissive.clone();
                //     // bắt đầu hiệu ứng pulsing
                //     gsap.to(child.material, {
                //         emissiveIntensity: 1,
                //         duration: 1,
                //         yoyo: true,
                //         repeat: -1,
                //         ease: 'sine.inOut'
                //     });
                // }

                // Thêm vào mảng clickable objects
                clickableObjects.push(child);
            }
        });

        scene.add(loadedModel);

        // --- Auto-start pulsing on `note_paper` so it's visible from scene start
        const noteRoot = loadedModel.getObjectByName('note_paper');
        if (noteRoot) {
            if (!isAggressiveMemorySave) {
                noteRoot.traverse((ch) => { if (ch.isMesh) applyHighlightToMesh(ch); });
                console.log('note_paper pulsing enabled on load');
            } else {
                console.log('Low quality mode: skip auto highlight on note_paper');
            }

            // Cập nhật spotlight target vào trung tâm note_paper
            const noteBox = new THREE.Box3().setFromObject(noteRoot);
            const noteCenter = noteBox.getCenter(new THREE.Vector3());
            spotLightTarget.position.copy(noteCenter);
        }

        // Căn giữa và cập nhật shadow camera target
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        controls.target.copy(center);
        camera.lookAt(center);
        
        // remember default camera target once we know scene center
        // if a specific object exists, aim at that instead
        const targetObj = loadedModel.getObjectByName('Closed_NewsPaper1_Newspaper_Texture_0_1');
        if (targetObj) {
            const objBox = new THREE.Box3().setFromObject(targetObj);
            const objCenter = objBox.getCenter(new THREE.Vector3());
            controls.target.copy(objCenter);
            camera.lookAt(objCenter);
            defaultCamTarget.copy(objCenter);
        } else {
            defaultCamTarget.copy(center);
        }

        completeLoadingProgress();
}

// === Load GLB với IndexedDB cache ===
(async function loadGLBWithCache() {
    if (!shouldUseGLBCache) {
        console.log('Low quality mode: skip IndexedDB GLB cache to reduce peak memory');
        fetchGLBNormal();
        return;
    }

    try {
        const db = await openGLBCache();
        const cached = await getCachedGLB(db, GLB_FILE_URL);

        if (cached) {
            // Có cache → parse trực tiếp từ ArrayBuffer, không cần download
            console.log('GLB loaded from IndexedDB cache');
            loaderWithProgress.parse(cached, '', onGLTFLoaded, function (error) {
                console.error('Parse cached GLB failed, re-downloading...', error);
                // Nếu parse lỗi (file cache hỏng), xoá cache và tải lại từ server
                setCachedGLB(db, GLB_FILE_URL, undefined).catch(() => {});
                fetchAndCacheGLB(db);
            });
        } else {
            // Chưa có cache → fetch từ server và lưu vào IndexedDB
            console.log('GLB not in cache, downloading from server...');
            fetchAndCacheGLB(db);
        }
    } catch (e) {
        // IndexedDB không khả dụng → fallback load bình thường
        console.warn('IndexedDB unavailable, loading GLB normally', e);
        fetchGLBNormal();
    }
})();

function fetchAndCacheGLB(db) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', GLB_FILE_URL, true);
    xhr.responseType = 'arraybuffer';
    xhr.onprogress = function (event) {
        if (event.lengthComputable) {
            updateLoadingProgress((event.loaded / event.total) * 95);
        }
    };
    xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 0) {
            const data = xhr.response;
            // Lưu vào IndexedDB cho lần sau
            setCachedGLB(db, GLB_FILE_URL, data).then(() => {
                console.log('GLB cached to IndexedDB');
            }).catch((err) => {
                console.warn('Failed to cache GLB', err);
            });
            // Parse model
            loaderWithProgress.parse(data, '', onGLTFLoaded, function (error) {
                console.error(error);
                hideLoadingScreen();
            });
        } else {
            console.error('Failed to fetch GLB:', xhr.status);
            hideLoadingScreen();
        }
    };
    xhr.onerror = function () {
        console.error('XHR error loading GLB');
        hideLoadingScreen();
    };
    xhr.send();
}

function fetchGLBNormal() {
    loaderWithProgress.load(GLB_FILE_URL,
        onGLTFLoaded,
        function (progress) {
            if (progress.lengthComputable) {
                updateLoadingProgress((progress.loaded / progress.total) * 95);
            }
        },
        function (error) {
            console.error(error);
            hideLoadingScreen();
        }
    );
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- CLICK EVENT HANDLER ---
function focusCameraOn(point, duration = 1, cameraPosOverride = null) {
    // nếu cameraPosOverride được truyền thì dùng nó trực tiếp, ngược lại tính offset như trước
    let targetPos;
    if (cameraPosOverride instanceof THREE.Vector3) {
        targetPos = cameraPosOverride.clone();
    } else {
        const offset = camera.position.clone().sub(controls.target);
        targetPos = point.clone().add(offset);
    }

    // animate camera position with gsap
    gsap.to(camera.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration,
        ease: "power2.inOut",
        onUpdate: () => {
            camera.lookAt(controls.target);
        }
    });

    // animate controls.target separately so orbit rotates around the new point
    const targetObj = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
    gsap.to(targetObj, {
        x: point.x,
        y: point.y,
        z: point.z,
        duration,
        ease: "power2.inOut",
        onUpdate: () => {
            controls.target.set(targetObj.x, targetObj.y, targetObj.z);
        }
    });
}

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, activeCamera);
    const intersects = raycaster.intersectObjects(clickableObjects, false);

    // map alias: click vào các object này sẽ được coi như click vào object gốc
    const objectNameAlias = {
        'newspaper_2_Material_Newspaper_Stack_0002_1': 'Closed_NewsPaper1_Newspaper_Texture_0_1',
        'newspaper_2_Material_Newspaper_Stack_0002': 'Closed_NewsPaper1_Newspaper_Texture_0_1',
        'anh_phai': 'anh_giua',
        'anh_phai001': 'anh_giua',
        'Tu': 'anh_giua',
        'Old_fan017_s_02_0': 'Old_fan004_propeller_0',
        'Old_fan019_s_03_0': 'Old_fan004_propeller_0',
        'Old_fan026_f_03_0': 'Old_fan004_propeller_0',
        'Old_fan018_botton_01_0': 'Old_fan004_propeller_0',
    };

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        const rawName = clickedObject.name || 'Unnamed Object';
        const objectName = objectNameAlias[rawName] || rawName;
        console.log(`Đã click vào [${rawName}]${rawName !== objectName ? ` → alias [${objectName}]` : ''}`);

        // Enforce: note_paper must be clicked first before any other object is interactive
        if (objectName !== 'note_paper' && !clickedImportant.has('note_paper')) {
            console.log('Tương tác bị khóa — hãy click vào note_paper trước.');
            return;
        }

        // nếu click vào Cua: chỉ cho tương tác khi đã click đủ các vật quan trọng
        if (objectName === 'Cua') {
            if (clickedImportant.size >= importantObjectNames.length) {
                const box = new THREE.Box3().setFromObject(clickedObject);
                const center = box.getCenter(new THREE.Vector3());
                // di chuyển camera giống các object khác
                focusCameraOn(center, 2, new THREE.Vector3(0.34, 1.7, -1.7));
                try { window.parent.postMessage('Cua', '*'); } catch (e) {}
            } else {
                console.log('Cua chưa mở tương tác — hãy click đủ các vật quan trọng trước.');
            }
            return; // ngăn các xử lý khác
        }

        // xử lý map clickActions nếu có
        if (clickActions[objectName]) {
            const action = clickActions[objectName];
            // nếu objectName là alias, tìm object gốc để zoom vào đúng vị trí
            const resolvedObj = (rawName !== objectName) ? scene.getObjectByName(objectName) || clickedObject : clickedObject;
            const box = new THREE.Box3().setFromObject(resolvedObj);
            const center = box.getCenter(new THREE.Vector3());

            // resolve lookAt: might be a Vector3 or a name of another object
            let lookAtPoint;
            if (action.lookAt instanceof THREE.Vector3) {
                lookAtPoint = action.lookAt;
            } else if (typeof action.lookAt === 'string') {
                const targetObj = scene.getObjectByName(action.lookAt);
                if (targetObj) {
                    const tbox = new THREE.Box3().setFromObject(targetObj);
                    lookAtPoint = tbox.getCenter(new THREE.Vector3());
                } else {
                    lookAtPoint = center; // fallback
                }
            } else {
                lookAtPoint = center;
            }

            focusCameraOn(lookAtPoint, 2, action.cameraPos);

            if (action.message !== undefined) {
                window.parent.postMessage(action.message, '*');
            }
            // cập nhật bộ đếm nếu object nằm trong danh sách quan trọng
            // If this is the note_paper, stop its auto-pulsing so it becomes a normal clicked object
                        if (objectName === 'note_paper') {
                const noteObj = scene.getObjectByName('note_paper');
                if (noteObj) noteObj.traverse(ch => { if (ch.isMesh) removeHighlightFromMesh(ch); });

                // Lần đầu click note_paper: bật RectAreaLight + Env, tắt SpotLight, animate saturation
                if (!sceneFullyLit) {
                    sceneFullyLit = true;
                    // Bật RectAreaLight
                    gsap.to(rectLight, { intensity: savedRectIntensity, duration: 2, ease: 'power2.inOut' });
                    // Bật Shadow Booster
                    gsap.to(shadowBooster, { intensity: savedShadowBoosterIntensity, duration: 2, ease: 'power2.inOut' });
                    // Bật Environment Map
                    const envAnim = { val: 0.3 };
                    gsap.to(envAnim, {
                        val: 1, duration: 2, ease: 'power2.inOut',
                        onUpdate: () => { scene.environmentIntensity = envAnim.val; }
                    });
                    // Tắt SpotLight sân khấu
                    gsap.to(spotLight, {
                        intensity: 0, duration: 2, ease: 'power2.inOut',
                        onComplete: () => { spotLight.visible = false; }
                    });
                    // Animate saturation từ 0.6 → 1
                    const satAnim = { val: 0.6 };
                    gsap.to(satAnim, {
                        val: 1, duration: 2, ease: 'power2.inOut',
                        onUpdate: () => { renderer.domElement.style.filter = `saturate(${satAnim.val})`; }
                    });
                }
            }

            updateImportantCounter(objectName);
        }
    }
}

// Highlight on click removed per user request

window.addEventListener('click', onMouseClick, false);


function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // apply hard camera bounds so the user cannot move past the allowed area
    const pos = activeCamera.position;
    const minBounds = { x: -2, y: 0.8, z: -2 };
    pos.x = Math.max(pos.x, minBounds.x);
    pos.y = Math.max(pos.y, minBounds.y);
    pos.z = Math.max(pos.z, minBounds.z);

    renderer.render(scene, activeCamera);

    // keep helper in sync if visible
    if (rectLightHelper && rectLightHelper.visible) rectLightHelper.update();
    if (spotLightHelper && spotLightHelper.visible) spotLightHelper.update();

    // update camera status text
    // camStatus.textContent = `cam: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`;
}
animate();

window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera2.aspect = aspect;
    camera2.updateProjectionMatrix();
    renderer.setPixelRatio(qualityProfile.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
});