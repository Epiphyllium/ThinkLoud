const UserProfileManager = {
    section: null,
    content: null,
    title: null,
    currentView: 'main', // main, roleList, roleEdit

    init() {
        this.section = document.getElementById('userProfileSection');
        this.content = document.getElementById('profileContent');
        this.title = document.getElementById('profileTitle');
        
        const closeBtn = document.getElementById('closeProfileBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }
    },

    show() {
        if (!this.section) this.init();
        this.section.classList.remove('hidden');
        this.renderMain();
    },

    hide() {
        if (this.section) {
            this.section.classList.add('hidden');
        }
    },

    renderMain() {
        this.currentView = 'main';
        this.title.innerText = '个人中心';
        this.content.innerHTML = `
            <div class="space-y-6 animate-fade-in">
                <!-- User Info Card -->
                <div class="glass rounded-2xl p-6 text-white">
                    <div class="flex items-center gap-4 mb-4">
                        <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                            👤
                        </div>
                        <div>
                            <h3 class="text-xl font-semibold">用户</h3>
                            <p class="opacity-60 text-sm">ThinkLoud ID: 001</p>
                        </div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <button id="openRoleLibBtn" class="w-full glass rounded-2xl p-6 flex items-center justify-between hover:bg-white/10 transition-colors text-white">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 bg-blue-500/30 rounded-full flex items-center justify-center">
                            👥
                        </div>
                        <span class="text-lg font-medium">人物库</span>
                    </div>
                    <svg class="w-6 h-6 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>
        `;

        // Add simple fade animation style if not exists
        if (!document.getElementById('profileStyles')) {
            const style = document.createElement('style');
            style.id = 'profileStyles';
            style.textContent = `
                .animate-fade-in { animation: fadeIn 0.3s ease; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }

        document.getElementById('openRoleLibBtn').addEventListener('click', () => {
            this.renderRoleList();
        });
    },

    async renderRoleList() {
        this.currentView = 'roleList';
        this.title.innerText = '人物库';
        
        this.content.innerHTML = '<div class="text-white opacity-60 text-center mt-10">加载中...</div>';

        try {
            // Fetch roles (fresh)
            const res = await fetch('/roles');
            const roles = await res.json();
            
            let html = `
                <div class="mb-4 animate-fade-in">
                    <button id="backToProfileBtn" class="text-white opacity-60 hover:opacity-100 flex items-center gap-1 text-sm mb-4">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                        返回个人中心
                    </button>
                    <div class="grid gap-3">
            `;
            
            if (roles.length === 0) {
                html += '<div class="text-white opacity-60 text-center py-8 glass rounded-xl">暂无角色</div>';
            } else {
                roles.forEach(role => {
                    const genderIcon = this.getGenderIcon(role.gender);
                    html += `
                        <div class="glass rounded-xl p-4 flex items-center justify-between text-white cursor-pointer hover:bg-white/10 transition-colors role-item" data-id="${role.role_id}">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg font-bold">
                                    ${role.name[0]}
                                </div>
                                <div>
                                    <div class="font-medium text-lg">${role.name}</div>
                                    <div class="text-xs opacity-60">${role.nickname ? '昵称: ' + role.nickname : '无昵称'}</div>
                                </div>
                            </div>
                            <div class="opacity-80 text-xl" title="${role.gender || '未知'}">
                                ${genderIcon}
                            </div>
                        </div>
                    `;
                });
            }
            html += '</div></div>';
            
            this.content.innerHTML = html;
            
            document.getElementById('backToProfileBtn').addEventListener('click', () => {
                this.renderMain();
            });

            document.querySelectorAll('.role-item').forEach(item => {
                item.addEventListener('click', () => {
                    const roleId = item.dataset.id;
                    const role = roles.find(r => r.role_id === roleId);
                    this.renderRoleEdit(role);
                });
            });

        } catch (e) {
            console.error(e);
            this.content.innerHTML = '<div class="text-red-300 text-center mt-10">加载失败</div>';
        }
    },

    getGenderIcon(gender) {
        if (!gender) return '⚪';
        const g = gender.toLowerCase();
        if (g === 'male' || g === '男') return '♂️';
        if (g === 'female' || g === '女') return '♀️';
        return '⚪';
    },

    renderRoleEdit(role) {
        this.currentView = 'roleEdit';
        this.title.innerText = '编辑角色';
        
        const isMale = role.gender && (role.gender.toLowerCase() === 'male' || role.gender === '男');
        const isFemale = role.gender && (role.gender.toLowerCase() === 'female' || role.gender === '女');
        const isNeutral = !isMale && !isFemale;

        this.content.innerHTML = `
            <div class="animate-fade-in">
                <div class="mb-4">
                    <button id="backToRoleListBtn" class="text-white opacity-60 hover:opacity-100 flex items-center gap-1 text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                        返回列表
                    </button>
                </div>
                
                <div class="glass rounded-2xl p-6 text-white space-y-6">
                    <!-- Name -->
                    <div>
                        <label class="block text-sm opacity-60 mb-2">角色名称</label>
                        <input type="text" id="editRoleName" value="${role.name}" class="w-full bg-white/10 rounded-lg px-4 py-3 outline-none focus:bg-white/20 transition-colors text-white">
                    </div>

                    <!-- Nickname -->
                    <div>
                        <label class="block text-sm opacity-60 mb-2">昵称 (可选)</label>
                        <input type="text" id="editRoleNickname" value="${role.nickname || ''}" class="w-full bg-white/10 rounded-lg px-4 py-3 outline-none focus:bg-white/20 transition-colors text-white">
                    </div>

                    <!-- Gender -->
                    <div>
                        <label class="block text-sm opacity-60 mb-4">性别</label>
                        <div class="flex gap-3">
                            <button class="gender-btn flex-1 py-4 rounded-xl border border-white/20 flex flex-col items-center gap-2 transition-all ${isMale ? 'bg-blue-500/50 border-blue-400 shadow-lg scale-105' : 'hover:bg-white/10'}" data-gender="Male">
                                <span class="text-2xl">♂️</span>
                                <span class="text-xs">男性</span>
                            </button>
                            <button class="gender-btn flex-1 py-4 rounded-xl border border-white/20 flex flex-col items-center gap-2 transition-all ${isFemale ? 'bg-pink-500/50 border-pink-400 shadow-lg scale-105' : 'hover:bg-white/10'}" data-gender="Female">
                                <span class="text-2xl">♀️</span>
                                <span class="text-xs">女性</span>
                            </button>
                            <button class="gender-btn flex-1 py-4 rounded-xl border border-white/20 flex flex-col items-center gap-2 transition-all ${isNeutral ? 'bg-green-500/50 border-green-400 shadow-lg scale-105' : 'hover:bg-white/10'}" data-gender="None">
                                <span class="text-2xl">⚪</span>
                                <span class="text-xs">无/其他</span>
                            </button>
                        </div>
                    </div>

                    <!-- Save -->
                    <button id="saveRoleBtn" class="w-full bg-white text-black font-bold py-4 rounded-full mt-6 hover:opacity-90 transition-opacity shadow-lg">
                        保存修改
                    </button>
                </div>
            </div>
        `;

        document.getElementById('backToRoleListBtn').addEventListener('click', () => {
            this.renderRoleList();
        });

        // Gender Selection Logic
        let selectedGender = role.gender;
        const genderBtns = document.querySelectorAll('.gender-btn');
        genderBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Reset styles
                genderBtns.forEach(b => {
                    b.className = 'gender-btn flex-1 py-4 rounded-xl border border-white/20 flex flex-col items-center gap-2 transition-all hover:bg-white/10';
                });
                
                // Set active style
                const g = btn.dataset.gender;
                selectedGender = g === 'None' ? null : g;
                
                if (g === 'Male') btn.classList.add('bg-blue-500/50', 'border-blue-400', 'shadow-lg', 'scale-105');
                else if (g === 'Female') btn.classList.add('bg-pink-500/50', 'border-pink-400', 'shadow-lg', 'scale-105');
                else btn.classList.add('bg-green-500/50', 'border-green-400', 'shadow-lg', 'scale-105');
                
                btn.classList.remove('hover:bg-white/10');
            });
        });

        document.getElementById('saveRoleBtn').addEventListener('click', async () => {
            const newName = document.getElementById('editRoleName').value.trim();
            const newNickname = document.getElementById('editRoleNickname').value.trim();
            
            if (!newName) {
                alert('名称不能为空');
                return;
            }

            const btn = document.getElementById('saveRoleBtn');
            const originalText = btn.innerText;
            btn.innerText = '保存中...';
            btn.classList.add('opacity-50', 'pointer-events-none');

            try {
                const res = await fetch('/role/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        role_id: role.role_id,
                        name: newName,
                        nickname: newNickname || null,
                        gender: selectedGender
                    })
                });

                if (res.ok) {
                    // Update global cache if exists
                    if (window.fetchRoles) window.fetchRoles(); 
                    
                    // Go back to list
                    this.renderRoleList();
                } else {
                    alert('保存失败');
                    btn.innerText = originalText;
                    btn.classList.remove('opacity-50', 'pointer-events-none');
                }
            } catch (e) {
                console.error(e);
                alert('网络错误');
                btn.innerText = originalText;
                btn.classList.remove('opacity-50', 'pointer-events-none');
            }
        });
    }
};

// Init on load
document.addEventListener('DOMContentLoaded', () => {
    UserProfileManager.init();
    // Expose globally
    window.UserProfileManager = UserProfileManager;
});
