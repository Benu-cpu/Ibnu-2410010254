
        // --- 1. SETUP ASAS THREE.JS & ALAT PEMBANTU ---
        const canvas = document.getElementById('space-canvas');
        let scene, camera, renderer, controls;
        let saturn, rings, stars;
        let ambientLight, directionalLight;
        
        // Pembolehubah Interaksi / Tetapan
        let rotationSpeedFactor = 1.0;
        let targetTilt = 26.7 * (Math.PI / 180); // 26.7 darjah ke radian
        let isFlybyActive = false;
        let flybyProgress = 0;
        let flybyCameraCurve;

        // Inisialisasi Audio Kosmik (Web Audio API)
        let audioCtx = null;
        let ambientDrone = null;
        let noiseFilter = null;
        let isAudioPlaying = false;

        // --- 2. PENJANAAN TEKSTUR PROSEDURAL (Estetik Tanpa Aset Luar) ---
        
        // Penjana Tekstur Planet Saturnus (Jalur Atmosfera)
        function generateSaturnTexture() {
            const width = 1024;
            const height = 512;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const ctx = tempCanvas.getContext('2d');

            // Cipta kecunan menegak untuk mewakili jalur-jalur gas Saturnus
            const grad = ctx.createLinearGradient(0, 0, 0, height);
            
            // Palet warna estetik Saturnus: Krim, Kuning Muted, Jingga Lembut, Coklat Pudar
            grad.addColorStop(0.0, '#2d241c'); // Kutub utara gelap
            grad.addColorStop(0.15, '#4e4133');
            grad.addColorStop(0.25, '#75624e');
            grad.addColorStop(0.35, '#a38d72');
            grad.addColorStop(0.42, '#cbb89b');
            grad.addColorStop(0.48, '#ded0b8');
            grad.addColorStop(0.50, '#e5dac5'); // Khatulistiwa cerah
            grad.addColorStop(0.52, '#ded0b8');
            grad.addColorStop(0.58, '#cbb89b');
            grad.addColorStop(0.65, '#a38d72');
            grad.addColorStop(0.75, '#75624e');
            grad.addColorStop(0.85, '#4e4133');
            grad.addColorStop(1.0, '#2d241c'); // Kutub selatan gelap

            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);

            // Tambahkan noise halus untuk mensimulasikan kepulan awan gas
            for (let y = 0; y < height; y++) {
                const noiseIntensity = Math.sin(y * 0.1) * 0.02 + Math.cos(y * 0.3) * 0.01;
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, noiseIntensity)})`;
                ctx.fillRect(0, y, width, 1);
                
                // Noise rawak mikro
                if (Math.random() > 0.3) {
                    ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.03})`;
                    ctx.fillRect(Math.random() * width, y, Math.random() * 20, 1);
                }
            }

            const texture = new THREE.CanvasTexture(tempCanvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            return texture;
        }

        // Penjana Tekstur Gelang Saturnus (Concentric Circles)
        function generateRingsTexture() {
            const size = 1024;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = size;
            tempCanvas.height = size;
            const ctx = tempCanvas.getContext('2d');
            const cx = size / 2;
            const cy = size / 2;

            // Bersihkan kanvas dengan telus penuh
            ctx.clearRect(0, 0, size, size);

            // Lukis lingkaran sepusat dengan kelegapan yang berbeza-beza
            // Meniru Bahagian C, B, Cassini, A, dan Encke
            for (let r = 160; r < 500; r++) {
                let alpha = 0;
                let color = '';

                if (r < 230) {
                    // Gelang C (Separuh telus, pudar di bahagian dalam)
                    alpha = ((r - 160) / 70) * 0.35;
                    color = `rgba(140, 125, 105, ${alpha})`;
                } else if (r >= 230 && r < 360) {
                    // Gelang B (Paling tebal dan terang)
                    const wave = Math.sin(r * 0.25) * 0.1 + Math.cos(r * 0.08) * 0.05;
                    alpha = 0.75 + wave;
                    color = `rgba(225, 205, 175, ${alpha})`;
                } else if (r >= 360 && r < 380) {
                    // Bahagian Cassini (Hampir kosong)
                    alpha = 0.02 + Math.sin(r * 0.5) * 0.01;
                    color = `rgba(30, 25, 20, ${alpha})`;
                } else if (r >= 380 && r < 460) {
                    // Gelang A (Sederhana terang)
                    const wave = Math.sin(r * 0.15) * 0.08;
                    alpha = 0.55 + wave;
                    color = `rgba(190, 175, 150, ${alpha})`;
                } else if (r >= 460 && r < 468) {
                    // Celah Encke (Kosong/Sangat nipis)
                    alpha = 0.05;
                    color = `rgba(40, 35, 30, ${alpha})`;
                } else {
                    // Gelang F (Bahagian paling luar, pudar keluar)
                    alpha = ((500 - r) / 32) * 0.4;
                    color = `rgba(150, 135, 115, ${alpha})`;
                }

                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            const texture = new THREE.CanvasTexture(tempCanvas);
            return texture;
        }

        // --- 3. PEMBINAAN ADegan 3D (THREE.JS SETUP) ---
        function initSpace() {
            // Scene & Renderer
            scene = new THREE.Scene();
            scene.fog = new THREE.FogExp2(0x020205, 0.002);

            camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(22, 10, 32);

            renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            // Orbit Controls untuk navigasi bebas
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxDistance = 150;
            controls.minDistance = 12;

            // Penambahan Pencahayaan
            ambientLight = new THREE.AmbientLight(0xffebc2, 0.25); // Cahaya ambien malap untuk bayangan gelang
            scene.add(ambientLight);

            directionalLight = new THREE.DirectionalLight(0xffebc2, 1.8);
            directionalLight.position.set(-30, 8, -10);
            directionalLight.castShadow = true;
            
            // Konfigurasi bayangan berkualiti tinggi
            directionalLight.shadow.mapSize.width = 2048;
            directionalLight.shadow.mapSize.height = 2048;
            directionalLight.shadow.camera.near = 0.5;
            directionalLight.shadow.camera.far = 100;
            const d = 15;
            directionalLight.shadow.camera.left = -d;
            directionalLight.shadow.camera.right = d;
            directionalLight.shadow.camera.top = d;
            directionalLight.shadow.camera.bottom = -d;
            directionalLight.shadow.bias = -0.0005;
            scene.add(directionalLight);

            // Cahaya rim (Rim Light) di belakang planet untuk efek aura estetik
            const rimLight = new THREE.DirectionalLight(0xfff5e6, 0.8);
            rimLight.position.set(30, -5, 10);
            scene.add(rimLight);

            // Cipta Kumpulan Sistem Saturnus (untuk membolehkan condong paksi yang sekata)
            saturnSystem = new THREE.Group();
            saturnSystem.rotation.z = targetTilt;
            scene.add(saturnSystem);

            // --- Pembinaan Tubuh Planet Saturnus ---
            const saturnGeo = new THREE.SphereGeometry(6, 64, 64);
            const saturnTex = generateSaturnTexture();
            
            // Menggunakan MeshStandardMaterial untuk tindak balas cahaya yang realistik
            const saturnMat = new THREE.MeshStandardMaterial({
                map: saturnTex,
                roughness: 0.8,
                metalness: 0.1,
                bumpMap: saturnTex,
                bumpScale: 0.02
            });
            
            saturn = new THREE.Mesh(saturnGeo, saturnMat);
            saturn.castShadow = true;
            saturn.receiveShadow = true;
            saturnSystem.add(saturn);

            // --- Pembinaan Gelang Saturnus ---
            // Kita gunakan PlaneGeometry dengan double-side material untuk gelang yang nipis dan tajam
            const ringGeo = new THREE.RingGeometry(8, 19, 128);
            const ringTex = generateRingsTexture();
            
            // Sesuaikan koordinat UV untuk pemetaan jejari (radial mapping) dari pusat ke luar
            const pos = ringGeo.attributes.position;
            const uv = ringGeo.attributes.uv;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const vertexRadius = Math.sqrt(x*x + y*y);
                const normalizedRadius = (vertexRadius - 8) / (19 - 8);
                uv.setXY(i, normalizedRadius, 0.5);
            }

            const ringMat = new THREE.MeshStandardMaterial({
                map: ringTex,
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide,
                roughness: 0.6,
                metalness: 0.2
            });

            rings = new THREE.Mesh(ringGeo, ringMat);
            rings.rotation.x = Math.PI / 2; // Baringkan gelang secara mendatar
            rings.castShadow = true;
            rings.receiveShadow = true;
            saturnSystem.add(rings);

            // --- Pembinaan Medan Bintang (Dynamic Starfield) ---
            const starsCount = 3500;
            const starsGeo = new THREE.BufferGeometry();
            const starsPos = new Float32Array(starsCount * 3);
            const starsColors = new Float32Array(starsCount * 3);

            for (let i = 0; i < starsCount * 3; i += 3) {
                // Letakkan bintang secara rawak dalam bentuk sfera besar di luar sistem
                const r = 200 + Math.random() * 200;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos((Math.random() * 2) - 1);

                starsPos[i] = r * Math.sin(phi) * Math.cos(theta);
                starsPos[i+1] = r * Math.sin(phi) * Math.sin(theta);
                starsPos[i+2] = r * Math.cos(phi);

                // Warna rawak bintang (Putih, Kuning, Biru Kosmik)
                const randColor = Math.random();
                if (randColor > 0.8) {
                    // Kebiruan
                    starsColors[i] = 0.8; starsColors[i+1] = 0.9; starsColors[i+2] = 1.0;
                } else if (randColor > 0.6) {
                    // Keemasan/Kuning
                    starsColors[i] = 1.0; starsColors[i+1] = 0.9; starsColors[i+2] = 0.7;
                } else {
                    // Putih bersih
                    starsColors[i] = 1.0; starsColors[i+1] = 1.0; starsColors[i+2] = 1.0;
                }
            }

            starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
            starsGeo.setAttribute('color', new THREE.BufferAttribute(starsColors, 3));

            // Tekstur zarah bintang bulat menggunakan Canvas
            const starCanvas = document.createElement('canvas');
            starCanvas.width = 16;
            starCanvas.height = 16;
            const starCtx = starCanvas.getContext('2d');
            const starGrad = starCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
            starGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            starGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            starCtx.fillStyle = starGrad;
            starCtx.fillRect(0, 0, 16, 16);
            const starTex = new THREE.CanvasTexture(starCanvas);

            const starsMat = new THREE.PointsMaterial({
                size: 0.6,
                vertexColors: true,
                map: starTex,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            stars = new THREE.Points(starsGeo, starsMat);
            scene.add(stars);

            // --- 4. MULAKAN ANIMASI LOOP ---
            animate();
        }

        // --- 5. LOOP REKREASI GRAPHICS (Rendering & Physics) ---
        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);

            const delta = clock.getDelta();
            const time = clock.getElapsedTime();

            // Putaran planet paksi
            if (saturn) {
                saturn.rotation.y += 0.015 * rotationSpeedFactor * (1 - (Math.sin(time * 0.1) * 0.05)); // Sedikit variasi organik
            }

            // Putaran gelang (jauh lebih perlahan daripada planet)
            if (rings) {
                rings.rotation.z -= 0.001 * rotationSpeedFactor;
            }

            // Animasi kelipan lembut medan bintang
            if (stars) {
                stars.rotation.y = time * 0.0015;
                stars.rotation.x = Math.sin(time * 0.05) * 0.01;
            }

            // Integrasi Interpolasi Condong Paksi
            if (saturnSystem && Math.abs(saturnSystem.rotation.z - targetTilt) > 0.01) {
                saturnSystem.rotation.z = THREE.MathUtils.lerp(saturnSystem.rotation.z, targetTilt, 0.05);
            }

            // Pengurusan Flyby Sinematik (Mengawal Laluan Kamera)
            if (isFlybyActive) {
                flybyProgress += delta * 0.06; // Memerlukan kira-kira 16 saat untuk kitaran lengkap
                if (flybyProgress > 1) {
                    isFlybyActive = false;
                    flybyProgress = 0;
                    controls.enabled = true; // Aktifkan semula kawalan manual
                    document.getElementById('btn-flyby').innerHTML = '<i class="fa-solid fa-shuttle-space text-xs"></i> Lakukan Flyby Sinematik';
                } else {
                    // Kira kedudukan kamera berdasarkan laluan spiral di angkasa
                    const angle = flybyProgress * Math.PI * 4; // Dua putaran penuh
                    const radius = 35 - Math.sin(flybyProgress * Math.PI) * 15; // Jarak berombak
                    const height = Math.cos(flybyProgress * Math.PI) * 12 + 4; // Ketinggian sudut

                    camera.position.x = Math.sin(angle) * radius;
                    camera.position.z = Math.cos(angle) * radius;
                    camera.position.y = height;
                    camera.lookAt(0, 0, 0);
                }
            } else {
                controls.update();
            }

            renderer.render(scene, camera);
        }

        // --- 6. INTEGRASI EVENT LISTENER & INTERFAIS ---

        // Penyesuaian Saiz Skrin Responsif
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Kawalan Slider Kelajuan Putaran
        const sliderSpeed = document.getElementById('slider-speed');
        const valSpeed = document.getElementById('val-speed');
        sliderSpeed.addEventListener('input', (e) => {
            rotationSpeedFactor = parseFloat(e.target.value);
            valSpeed.innerText = rotationSpeedFactor.toFixed(1) + 'x';
        });

        // Kawalan Slider Kecondongan Paksi
        const sliderTilt = document.getElementById('slider-tilt');
        const valTilt = document.getElementById('val-tilt');
        sliderTilt.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            targetTilt = val * (Math.PI / 180);
            valTilt.innerText = val + '.0°';
        });

        // Kawalan Pilihan Warna Suasana Pencahayaan (Preset Cahaya)
        const lightButtons = document.querySelectorAll('.light-preset-btn');
        lightButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Padam kelas aktif dari butang lain
                lightButtons.forEach(b => {
                    b.classList.remove('bg-amber-400/10', 'border-amber-400/30', 'text-amber-200');
                    b.classList.add('bg-white/5', 'border-white/5', 'text-slate-300');
                });
                // Pasang kelas aktif pada butang yang ditekan
                e.target.classList.add('bg-amber-400/10', 'border-amber-400/30', 'text-amber-200');
                e.target.classList.remove('bg-white/5', 'border-white/5', 'text-slate-300');

                // Tukar warna lampu directional kosmik
                const colorHex = e.target.getAttribute('data-color');
                const targetColor = new THREE.Color(colorHex);
                
                // Transisi warna pencahayaan secara lancar menggunakan gsap-like lerp
                let steps = 0;
                const transitionInterval = setInterval(() => {
                    directionalLight.color.lerp(targetColor, 0.1);
                    steps++;
                    if (steps > 20) clearInterval(transitionInterval);
                }, 30);
            });
        });

        // Pengurusan Tab Maklumat Interaktif
        const tabButtons = document.querySelectorAll('.info-tab-btn');
        const tabContent = document.getElementById('tab-content');

        const tabData = {
            fakta: `<div class="flex flex-col gap-3">
                        <p>Saturnus adalah planet keenam dari Matahari dan planet kedua terbesar dalam Sistem Suria kita. Merupakan gergasi gas yang sebahagian besarnya terdiri daripada hidrogen dan helium.</p>
                        <div class="grid grid-cols-2 gap-3 mt-1 pt-3 border-t border-white/5 text-xs font-display">
                            <div>
                                <span class="block text-slate-500">Purata Jejari</span>
                                <span class="text-amber-200 font-semibold">58,232 km</span>
                            </div>
                            <div>
                                <span class="block text-slate-500">Jarak dari Matahari</span>
                                <span class="text-amber-200 font-semibold">1.4 Bilion km</span>
                            </div>
                            <div>
                                <span class="block text-slate-500">Tempoh Putaran</span>
                                <span class="text-amber-200 font-semibold">10 Jam 33 Minit</span>
                            </div>
                            <div>
                                <span class="block text-slate-500">Tempoh Orbit</span>
                                <span class="text-amber-200 font-semibold">29 Tahun Bumi</span>
                            </div>
                        </div>
                    </div>`,
            gelang: `<div class="flex flex-col gap-2">
                        <p>Sistem gelang Saturnus adalah yang paling luas dan menakjubkan dalam sistem suria. Lebarnya menjangkau sehingga 282,000 kilometer, namun ketebalannya hanyalah sekitar 10 meter!</p>
                        <p class="text-xs text-slate-400 mt-1">Gelang ini terdiri daripada berbilion-bilion zarah ais air, debu, dan serpihan batu bersaiz dari sekecil pasir sehingga sebesar gunung.</p>
                     </div>`,
            bulan: `<div class="flex flex-col gap-2">
                        <p>Saturnus mempunyai sekurang-kurangnya 146 bulan yang telah disahkan di orbitnya. Bulan yang paling terkenal ialah Titan yang bersaiz lebih besar daripada Utarid.</p>
                        <div class="mt-2 p-2 bg-white/5 rounded text-xs">
                            <strong class="text-amber-200 block mb-1">Titan:</strong>
                            Satu-satunya bulan di sistem suria yang memiliki atmosfera tebal dan tasik cecair hidrokarbon di permukaannya.
                        </div>
                     </div>`
        };

        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tabButtons.forEach(b => {
                    b.classList.remove('bg-amber-400/20', 'text-amber-200');
                    b.classList.add('text-slate-400', 'hover:text-slate-200');
                });
                e.target.classList.add('bg-amber-400/20', 'text-amber-200');
                e.target.classList.remove('text-slate-400', 'hover:text-slate-200');

                const selectedTab = e.target.getAttribute('data-tab');
                
                // Efek transisi pudar (fade)
                tabContent.style.opacity = '0';
                setTimeout(() => {
                    tabContent.innerHTML = tabData[selectedTab];
                    tabContent.style.opacity = '1';
                }, 150);
            });
        });

        // Trigger Flyby Kamera Sinematik
        document.getElementById('btn-flyby').addEventListener('click', () => {
            if (!isFlybyActive) {
                isFlybyActive = true;
                flybyProgress = 0;
                controls.enabled = false; // Kunci kawalan manual
                document.getElementById('btn-flyby').innerHTML = '<i class="fa-solid fa-spinner animate-spin text-xs"></i> Kembara Flyby Sedang Aktif...';
            } else {
                isFlybyActive = false;
                controls.enabled = true;
                document.getElementById('btn-flyby').innerHTML = '<i class="fa-solid fa-shuttle-space text-xs"></i> Lakukan Flyby Sinematik';
            }
        });

        // Butang Buka/Tutup Panel Info untuk Skrin Mudah Alih
        const infoToggleBtn = document.getElementById('btn-info-toggle');
        const panelInfo = document.getElementById('panel-info');
        let isPanelOpen = true;

        infoToggleBtn.addEventListener('click', () => {
            isPanelOpen = !isPanelOpen;
            if (isPanelOpen) {
                panelInfo.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
                panelInfo.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
            } else {
                panelInfo.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
                panelInfo.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
            }
        });

        // --- 7. SINTESIS AUDIO KOSMIK (Web Audio API) ---
        // Menjana ambient angkasa lepas secara sintetik tanpa fail audio luaran
        function toggleCosmicAudio() {
            if (!audioCtx) {
                // Bina konteks audio jika tiada
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();
            }

            const btnAudio = document.getElementById('btn-audio');
            const audioIcon = document.getElementById('audio-icon');

            if (!isAudioPlaying) {
                // Hidupkan bunyi
                audioCtx.resume();
                
                // 1. Synth Oscillator Utama (Frekuensi rendah untuk bunyi 'hum' angkasa)
                ambientDrone = audioCtx.createOscillator();
                ambientDrone.type = 'sawtooth';
                ambientDrone.frequency.setValueAtTime(55, audioCtx.currentTime); // A1 Note

                // 2. Tapis bunyi berisik (Low pass filter) untuk menjadikannya sangat pudar/dalam
                noiseFilter = audioCtx.createBiquadFilter();
                noiseFilter.type = 'lowpass';
                noiseFilter.frequency.setValueAtTime(150, audioCtx.currentTime);
                noiseFilter.Q.setValueAtTime(5, audioCtx.currentTime);

                // LFO (Low Frequency Oscillator) untuk mengubah kelantangan secara perlahan (efek bernafas)
                const lfo = audioCtx.createOscillator();
                lfo.frequency.setValueAtTime(0.08, audioCtx.currentTime); // Kitaran 12 saat
                
                const lfoGain = audioCtx.createGain();
                lfoGain.gain.setValueAtTime(40, audioCtx.currentTime);

                // Kawalan Output Gain
                const masterGain = audioCtx.createGain();
                masterGain.gain.setValueAtTime(0.03, audioCtx.currentTime); // Kelantangan sangat lembut

                // Sambungkan Rangkaian Audio
                lfo.connect(lfoGain);
                lfoGain.connect(noiseFilter.frequency); // Mengubah penapis secara dinamik
                
                ambientDrone.connect(noiseFilter);
                noiseFilter.connect(masterGain);
                masterGain.connect(audioCtx.destination);

                // Mulakan Penghasilan Bunyi
                ambientDrone.start();
                lfo.start();

                isAudioPlaying = true;
                btnAudio.classList.add('bg-amber-400/20', 'border-amber-400/40');
                audioIcon.className = "fa-solid fa-volume-high text-sm text-amber-300";
            } else {
                // Matikan bunyi
                if (ambientDrone) {
                    ambientDrone.stop();
                    ambientDrone.disconnect();
                }
                isAudioPlaying = false;
                btnAudio.classList.remove('bg-amber-400/20', 'border-amber-400/40');
                audioIcon.className = "fa-solid fa-volume-xmark text-sm text-amber-200/80";
            }
        }

        document.getElementById('btn-audio').addEventListener('click', toggleCosmicAudio);

        // --- 8. DIALOG KREDIT / MODAL ---
        const creditsTrigger = document.getElementById('credits-trigger');
        const creditsModal = document.getElementById('credits-modal');
        const creditsClose = document.getElementById('credits-close');

        creditsTrigger.addEventListener('click', () => {
            creditsModal.classList.remove('hidden');
        });
        
        creditsClose.addEventListener('click', () => {
            creditsModal.classList.add('hidden');
        });

        // Mulakan rendering sebaik sahaja tetingkap dimuat sepenuhnya
        window.onload = function() {
            initSpace();
        };