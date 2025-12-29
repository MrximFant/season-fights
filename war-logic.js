window.warRoom = function() {
    return {
        // --- STATE ---
        tab: 'warroom', loading: true, mobileMenu: false, searchQuery: '', debugStatus: 'Ready',
        refSearch: '', week: 1, round1Reset: '', currentPhase: '', phaseAction: '', phaseCountdown: '', currentRoundText: '',
        alliances: [], players: [], history: [], cities: [], openAlliances: [], openServers: [],
        authenticated: false, passInput: '', editTag: '', modifiedTags: [], myAllianceName: '',

        // --- INIT ---
        init() {
            this.myAllianceName = localStorage.getItem('war_ref_alliance') || '';
            this.round1Reset = localStorage.getItem('war_round1_reset') || '';
            this.fetchData();
            this.updateClock();
            setInterval(() => this.updateClock(), 1000);
        },

        applyCalendar() {
            if (!this.round1Reset) return alert("Please select a date/time.");
            localStorage.setItem('war_round1_reset', this.round1Reset);
            this.updateClock();
            alert("Timeline Synchronized!");
        },

        saveSettings() {
            localStorage.setItem('war_ref_alliance', this.myAllianceName);
        },

        updateClock() {
            const now = new Date();
            if (this.round1Reset) {
                const start = new Date(this.round1Reset);
                if (!isNaN(start)) {
                    const diffMs = now - start;
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    this.week = Math.max(1, Math.min(4, Math.floor(diffDays / 7) + 1));
                    const dayOfWeek = now.getDay(); 
                    const isSecondHalf = (dayOfWeek === 0 || dayOfWeek >= 4);
                    const roundNum = ((this.week - 1) * 2) + (isSecondHalf ? 2 : 1);
                    this.currentRoundText = `Round ${roundNum}`;
                }
            } else { this.currentRoundText = "Set Reset Time"; }

            const hr = now.getHours();
            const d = now.getDay();
            if (d === 1 || d === 4) { this.currentPhase = "Grouping Phase"; this.phaseAction = "Brackets forming."; }
            else if (d === 2 || d === 5) { this.currentPhase = "Declaration Stage"; this.phaseAction = "R4+ Declare War now!"; }
            else if (d === 3 || d === 6) { 
                if (hr < 12) { this.currentPhase = "Invitation Stage"; this.phaseAction = "Invite defense allies."; }
                else if (hr < 13) { this.currentPhase = "Preparation"; this.phaseAction = "Missiles/Tesla window."; }
                else if (hr < 14) { this.currentPhase = "WAR ACTIVE"; this.phaseAction = "WH (3%) -> Center (6%)"; }
                else { this.currentPhase = "Cooling Down"; this.phaseAction = "Analyzing results."; }
            } else { this.currentPhase = "Rest Time"; this.phaseAction = "Prepare for next round."; }
            this.phaseCountdown = now.toLocaleTimeString();
        },

        // --- DATA SYNC ---
        async fetchData() {
            this.loading = true;
            const cb = `&t=${Date.now()}`;
            const base = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFfdDzrMXgqdjSZrSI4YcbDvFoYlrri87EEhG2I9aecW2xcuuLFcl-sxEVjvY1LTdPkXjKSzlwoNQd/pub?output=csv&gid=';
            const scrub = (d) => d.map(r => { let c = {}; Object.keys(r).forEach(k => c[k.trim().toLowerCase().replace(/\s+/g,'')] = r[k] ? String(r[k]).trim() : ''); return c; });
            const fetchCSV = async (gid) => { try { const r = await fetch(base + gid + cb); const t = await r.text(); return scrub(Papa.parse(t, {header:true, skipEmptyLines:true}).data); } catch (e) { return []; } };
            const [rawA, rawP, rawC, rawH] = await Promise.all([fetchCSV('0'), fetchCSV('1007829300'), fetchCSV('1860064624'), fetchCSV('1091133615')]);
            
            const mapF = (f) => {
                if (!f) return 'Unassigned';
                const l = f.toLowerCase();
                if (l.includes('kage') || l.includes('red')) return 'Kage no Sato';
                if (l.includes('koubu') || l.includes('blue')) return 'Koubutai';
                return 'Unassigned';
            };

            this.alliances = rawA.map(r => ({ faction: mapF(r.faction), server: r.server, tag: r.tag, name: r.alliancename, power: Number((r.totalpower || '').replace(/\D/g,'')) || 0 })).filter(r => r.tag);
            this.players = rawP.map(r => ({ tag: r.tag, name: r.playername, thp: Number((r.thp || '').replace(/\D/g,'')) || 0 })).filter(r => r.name);
            this.cities = rawC; this.history = rawH;
            this.loading = false;
            this.debugStatus = `OK: ${this.alliances.length} Alliances`;
        },

        // --- CALCULATED DATA ---
        get factionData() {
            return this.alliances.map(a => {
                const snps = this.history.filter(x => x.tag.toLowerCase() === a.tag.toLowerCase()).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                const lastStash = snps[0] ? Number(snps[0].totalcopper.replace(/\D/g,'')) : 0;
                const lastTime = snps[0] ? new Date(snps[0].timestamp) : new Date();
                
                // Live ticking logic
                const rate = this.getPassiveRate(a.tag);
                const hoursPassed = (new Date() - lastTime) / 3600000;
                const estimatedStash = lastStash + (rate * hoursPassed);

                return { ...a, stash: estimatedStash, rawStash: lastStash, rate: rate };
            });
        },

        get knsGroups() { return this.getGroupedFaction('Kage no Sato'); },
        get kbtGroups() { return this.getGroupedFaction('Koubutai'); },

        getGroupedFaction(fName) {
            const sorted = this.factionData.filter(a => a.faction === fName).sort((a,b) => b.stash - a.stash);
            const groups = [];
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            let i = 0;
            while (i < 30 && i < sorted.length) {
                const gid = Math.floor(i / step) + 1;
                groups.push({ id: gid, label: `Rank ${i+1}-${Math.min(i+step, 30)}`, alliances: sorted.slice(i, i + step) });
                i += step;
            }
            if (sorted.length > 30) groups.push({ id: (this.week===1?4:(this.week===2?6:11)), label: "Rank 31-100", alliances: sorted.slice(30, 100) });
            return groups;
        },

        get groupedForces() {
            const groups = {};
            const allianceRanks = this.alliances.map(a => {
                const pList = this.players.filter(p => (p.tag||'').toLowerCase() === a.tag.toLowerCase());
                const maxTHP = pList.length > 0 ? Math.max(...pList.map(p => p.thp)) : 0;
                
                // Get stash for this alliance
                const data = this.factionData.find(f => f.tag === a.tag);
                return { ...a, maxTHP, stash: data ? data.stash : 0 };
            });
            allianceRanks.forEach(a => { if (!groups[a.server]) groups[a.server] = []; groups[a.server].push(a); });
            Object.keys(groups).forEach(s => groups[s].sort((a,b) => b.maxTHP - a.maxTHP));
            return groups;
        },

        get filteredRefList() {
            const list = [...this.alliances].sort((a,b) => a.name.localeCompare(b.name));
            if (!this.refSearch) return list;
            const q = this.refSearch.toLowerCase();
            return list.filter(a => (a.tag||'').toLowerCase().includes(q) || (a.name||'').toLowerCase().includes(q));
        },

        isAllyServer(serverGroup) {
            if (!this.myAllianceName) return true;
            const myF = this.alliances.find(a => a.name === this.myAllianceName)?.faction;
            if (myF === 'Unassigned') return true;
            return serverGroup.some(a => a.faction === myF);
        },

        get knsTotalStash() { return this.factionData.filter(a => a.faction.includes('Kage')).reduce((s, a) => s + a.stash, 0); },
        get kbtTotalStash() { return this.factionData.filter(a => a.faction.includes('Koubu')).reduce((s, a) => s + a.stash, 0); },
        getPlayersForAlliance(tag) { return this.players.filter(p => (p.tag||'').toLowerCase() === tag.toLowerCase()).sort((a,b) => b.thp - a.thp); },
        
        getPassiveRate(tag) { 
            const c = this.cities.find(x => (x.tag||'').toLowerCase() === tag.toLowerCase()); 
            if (!c) return 0;
            return (Number(c.l1||0)*100)+(Number(c.l2||0)*200)+(Number(c.l3||0)*300)+(Number(c.l4||0)*400)+(Number(c.l5||0)*500)+(Number(c.l6||0)*600);
        },
        
        isMatch(t) { 
            if (!this.myAllianceName) return false; 
            const me = this.factionData.find(a => a.name === this.myAllianceName); 
            if (!me || t.faction === me.faction || t.faction === 'Unassigned') return false; 
            const meG = this.getGroupedFaction(me.faction).find(g => g.alliances.some(x => x.tag === me.tag))?.id; 
            const taG = this.getGroupedFaction(t.faction).find(g => g.alliances.some(x => x.tag === t.tag))?.id; 
            return meG === taG; 
        },

        matchesSearch(a) { const q = this.searchQuery.toLowerCase(); return (a.name||'').toLowerCase().includes(q) || (a.tag||'').toLowerCase().includes(q); },
        toggleAlliance(tag) { this.openAlliances = this.openAlliances.includes(tag) ? this.openAlliances.filter(x => x !== tag) : [...this.openAlliances, tag]; },
        isAllianceOpen(tag) { return this.openAlliances.includes(tag); },
        toggleServerCollapse(s) { this.openServers = this.isServerOpen(s) ? this.openServers.filter(x => x !== s) : [...this.openServers, s]; },
        isServerOpen(s) { return this.openServers.includes(s); },
        
        login() { if (this.passInput === 'KING') this.authenticated = true; },
        getCityCount(n) { const c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); return c ? Number(c['l'+n] || 0) : 0; },
        getTotalCities() { const c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); return c ? [1,2,3,4,5,6].reduce((s, i) => s + Number(c['l'+i] || 0), 0) : 0; },
        updateCity(n, d) { let c = this.cities.find(x => (x.tag||'').toLowerCase() === this.editTag.toLowerCase()); if (!c) { c = { tag: this.editTag.toLowerCase(), l1:0,l2:0,l3:0,l4:0,l5:0,l6:0 }; this.cities.push(c); } if (d > 0 && this.getTotalCities() >= 6) return alert("Max 6 cities!"); c['l'+n] = Math.max(0, Number(c['l'+n] || 0) + d); if (!this.modifiedTags.includes(this.editTag)) this.modifiedTags.push(this.editTag); },
        exportCities() { const csv = Papa.unparse(this.cities); const b = new Blob([csv],{type:'text/csv'}); const u = window.URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'cities.csv'; a.click(); this.modifiedTags = []; },
        copyScoutPrompt() { navigator.clipboard.writeText("Please provide: [Tag], [Alliance Name], [Stash], [Time]."); alert("Prompt Copied!"); },
        formatNum(v) { return Math.floor(v || 0).toLocaleString(); },
        formatPower(v) { return (v/1000000000).toFixed(2) + 'B'; }
    }
}
