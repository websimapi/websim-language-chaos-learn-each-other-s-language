class LanguageChaosGame {
    constructor() {
        this.room = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.audioCache = new Map();
        this.currentPlayingAudio = null;
        this.speechRecognition = null;
        this.finalTranscript = '';
        this.interimTranscript = '';
        
        this.useVoiceCloning = true;
        this.defaultVoice = 'en-male';
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadCacheFromStorage();
        this.showDisclaimer();
    }

    showDisclaimer() {
        const modal = document.getElementById('disclaimerModal');
        const acceptBtn = document.getElementById('acceptDisclaimer');
        const declineBtn = document.getElementById('declineDisclaimer');

        acceptBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            document.getElementById('gameContent').style.display = 'block';
            this.initializeGame();
        });

        declineBtn.addEventListener('click', () => {
            alert('Voice cloning disabled. You can still play with default voices!');
            document.getElementById('useVoiceCloning').checked = false;
            this.useVoiceCloning = false;
            modal.style.display = 'none';
            document.getElementById('gameContent').style.display = 'block';
            this.initializeGame();
        });
    }

    async initializeGame() {
        try {
            this.room = new WebsimSocket();
            await this.room.initialize();

            this.room.subscribePresence((presence) => {
                this.updatePlayersList();
            });

            this.room.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            await this.setupMicrophone();
            this.updatePlayersList();
            
            console.log('Game initialized successfully');
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.showError('Failed to connect to game. Please refresh and try again.');
        }
    }

    setupEventListeners() {
        const recordBtn = document.getElementById('recordBtn');
        const useVoiceCloningCheckbox = document.getElementById('useVoiceCloning');
        const defaultVoiceSelect = document.getElementById('defaultVoice');
        const clearCacheBtn = document.getElementById('clearCache');
        const textInput = document.getElementById('textInput');
        const sendTextBtn = document.getElementById('sendTextBtn');

        // Record button - hold to record
        recordBtn.addEventListener('mousedown', () => this.startRecording());
        recordBtn.addEventListener('mouseup', () => this.stopRecording());
        recordBtn.addEventListener('mouseleave', () => this.stopRecording());
        
        // Touch events for mobile
        recordBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        recordBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        // Text input events
        textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendTypedMessage();
            }
        });

        sendTextBtn.addEventListener('click', () => {
            this.sendTypedMessage();
        });

        useVoiceCloningCheckbox.addEventListener('change', (e) => {
            this.useVoiceCloning = e.target.checked;
            defaultVoiceSelect.disabled = this.useVoiceCloning;
        });

        defaultVoiceSelect.addEventListener('change', (e) => {
            this.defaultVoice = e.target.value;
        });

        clearCacheBtn.addEventListener('click', () => {
            this.clearAudioCache();
        });
    }

    async setupMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };

            // Setup speech recognition
            this.setupSpeechRecognition();

            console.log('Microphone setup successful');
        } catch (error) {
            console.error('Microphone setup failed:', error);
            this.showError('Microphone access required to play. Please allow microphone access and refresh.');
        }
    }

    setupSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('Speech recognition not supported');
            return;
        }

        this.speechRecognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.lang = 'en-US';

        this.speechRecognition.onresult = (event) => {
            this.finalTranscript = '';
            this.interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    this.finalTranscript += transcript;
                } else {
                    this.interimTranscript += transcript;
                }
            }

            this.updateLiveTranscript();
        };

        this.speechRecognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
        };

        this.speechRecognition.onend = () => {
            // Recognition ended, this is normal when recording stops
        };
    }

    updateLiveTranscript() {
        const liveTranscriptElement = document.getElementById('liveTranscript');
        const finalText = this.finalTranscript;
        const interimText = this.interimTranscript;

        liveTranscriptElement.innerHTML = `
            <span class="final">${finalText}</span>
            <span class="interim">${interimText}</span>
        `;
    }

    startRecording() {
        if (!this.mediaRecorder || this.isRecording) return;

        this.audioChunks = [];
        this.isRecording = true;
        this.finalTranscript = '';
        this.interimTranscript = '';
        
        const recordBtn = document.getElementById('recordBtn');
        const recordText = recordBtn.querySelector('.record-text');
        const recordIcon = recordBtn.querySelector('.record-icon');
        const liveTranscriptElement = document.getElementById('liveTranscript');
        
        recordBtn.classList.add('recording');
        recordText.textContent = 'Recording...';
        recordIcon.textContent = '🔴';
        liveTranscriptElement.classList.add('active');
        liveTranscriptElement.innerHTML = '<span class="interim">Listening...</span>';
        
        document.getElementById('recordingStatus').textContent = 'Recording... Release to send';
        
        this.mediaRecorder.start();
        
        // Start speech recognition
        if (this.speechRecognition) {
            try {
                this.speechRecognition.start();
            } catch (error) {
                console.error('Failed to start speech recognition:', error);
            }
        }
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        
        const recordBtn = document.getElementById('recordBtn');
        const recordText = recordBtn.querySelector('.record-text');
        const recordIcon = recordBtn.querySelector('.record-icon');
        const liveTranscriptElement = document.getElementById('liveTranscript');
        
        recordBtn.classList.remove('recording');
        recordText.textContent = 'Hold to Record';
        recordIcon.textContent = '🎤';
        
        document.getElementById('recordingStatus').textContent = 'Processing...';
        
        // Stop speech recognition
        if (this.speechRecognition) {
            try {
                this.speechRecognition.stop();
            } catch (error) {
                console.error('Failed to stop speech recognition:', error);
            }
        }
        
        this.mediaRecorder.stop();
        
        // Hide live transcript after a delay
        setTimeout(() => {
            liveTranscriptElement.classList.remove('active');
        }, 1000);
    }

    async processRecording() {
        try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // Use the final transcript from real-time recognition
            const text = this.finalTranscript.trim();
            
            if (!text) {
                this.showError('No speech detected. Please try again.');
                document.getElementById('recordingStatus').textContent = '';
                return;
            }

            // Transform text using LLM
            const transformedText = await this.transformText(text);
            
            // Convert to speech
            const audioUrl = await this.textToSpeech(transformedText, audioBlob);
            
            // Send message to other players
            this.sendAudioMessage(audioUrl, transformedText);
            
            document.getElementById('recordingStatus').textContent = '';
            
        } catch (error) {
            console.error('Processing failed:', error);
            this.showError('Failed to process recording. Please try again.');
            document.getElementById('recordingStatus').textContent = '';
        }
    }

    async transformText(originalText) {
        try {
            const response = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a language chaos generator. Take the input text and transform each word into a different language while keeping the same meaning. Use a variety of languages like Spanish, French, German, Italian, Portuguese, Japanese, Chinese, Arabic, Russian, etc. Make it fun and educational!

Example: "Hello how are you today" might become "Hola wie geht es dir aujourd'hui"

Return only the transformed text, nothing else.`
                    },
                    {
                        role: "user",
                        content: originalText
                    }
                ]
            });

            return response.content.trim();
        } catch (error) {
            console.error('LLM transformation failed:', error);
            // Fallback: just return original text
            return originalText;
        }
    }

    async textToSpeech(text, originalAudioBlob = null) {
        try {
            let audioResult;

            if (this.useVoiceCloning && originalAudioBlob) {
                // Upload original audio for voice cloning
                const voiceSampleUrl = await websim.upload(originalAudioBlob);
                
                audioResult = await websim.textToSpeech({
                    text: text,
                    voice_sample: voiceSampleUrl
                });
            } else {
                audioResult = await websim.textToSpeech({
                    text: text,
                    voice: this.defaultVoice
                });
            }

            // Cache the audio URL
            const cacheKey = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            this.audioCache.set(cacheKey, audioResult.url);
            this.saveCacheToStorage();

            return audioResult.url;
        } catch (error) {
            console.error('Text to speech failed:', error);
            throw error;
        }
    }

    sendAudioMessage(audioUrl, transformedText) {
        const messageData = {
            type: 'audio_message',
            audioUrl: audioUrl,
            transformedText: transformedText,
            timestamp: Date.now(),
            clientId: this.room.clientId,
            username: this.room.peers[this.room.clientId]?.username || 'Unknown',
            avatarUrl: this.room.peers[this.room.clientId]?.avatarUrl || ''
        };

        this.room.send(messageData);
        
        // Add to local chat immediately
        this.addMessageToChat(messageData);
    }

    handleMessage(data) {
        switch (data.type) {
            case 'audio_message':
                if (data.clientId !== this.room.clientId) {
                    this.addMessageToChat(data);
                }
                break;
            case 'connected':
                console.log(`${data.username} joined the game`);
                break;
            case 'disconnected':
                console.log(`${data.username} left the game`);
                break;
        }
    }

    addMessageToChat(messageData) {
        const chatMessages = document.getElementById('chatMessages');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        const timestamp = new Date(messageData.timestamp).toLocaleTimeString();
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <img src="${messageData.avatarUrl}" alt="Avatar" class="message-avatar">
                <span class="message-username">${messageData.username}</span>
                <span class="message-time">${timestamp}</span>
            </div>
            <div class="message-content">
                <button class="play-audio-btn" data-audio-url="${messageData.audioUrl}">
                    ▶️
                </button>
                <span class="transformed-text">${messageData.transformedText}</span>
            </div>
        `;

        const playBtn = messageDiv.querySelector('.play-audio-btn');
        playBtn.addEventListener('click', () => {
            this.playAudio(messageData.audioUrl, playBtn);
        });

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async playAudio(audioUrl, buttonElement) {
        try {
            // Stop current audio if playing
            if (this.currentPlayingAudio) {
                this.currentPlayingAudio.pause();
                document.querySelectorAll('.play-audio-btn.playing').forEach(btn => {
                    btn.classList.remove('playing');
                    btn.textContent = '▶️';
                });
            }

            buttonElement.classList.add('playing');
            buttonElement.textContent = '⏸️';

            const audio = new Audio(audioUrl);
            this.currentPlayingAudio = audio;

            audio.onended = () => {
                buttonElement.classList.remove('playing');
                buttonElement.textContent = '▶️';
                this.currentPlayingAudio = null;
            };

            audio.onerror = () => {
                buttonElement.classList.remove('playing');
                buttonElement.textContent = '❌';
                this.currentPlayingAudio = null;
                this.showError('Failed to play audio');
            };

            await audio.play();
        } catch (error) {
            console.error('Audio playback failed:', error);
            buttonElement.classList.remove('playing');
            buttonElement.textContent = '❌';
            this.showError('Failed to play audio');
        }
    }

    updatePlayersList() {
        const playersList = document.getElementById('playersList');
        const playerCount = document.getElementById('playerCount');
        
        const peers = Object.values(this.room.peers);
        playerCount.textContent = peers.length;
        
        playersList.innerHTML = peers.map(peer => `
            <div class="player-item">
                <img src="${peer.avatarUrl}" alt="Avatar" class="player-avatar">
                <span>${peer.username}</span>
                ${peer.id === this.room.clientId ? '(You)' : ''}
            </div>
        `).join('');
    }

    clearAudioCache() {
        if (confirm('Clear all your generated audio from the chat history? This action cannot be undone.')) {
            this.audioCache.clear();
            this.saveCacheToStorage();
            
            // Remove own messages from chat
            const messages = document.querySelectorAll('.message');
            messages.forEach(message => {
                const username = message.querySelector('.message-username').textContent;
                const myUsername = this.room.peers[this.room.clientId]?.username || 'Unknown';
                if (username === myUsername) {
                    message.remove();
                }
            });
            
            this.showSuccess('Audio cache cleared successfully!');
        }
    }

    loadCacheFromStorage() {
        try {
            const cached = localStorage.getItem('languageChaosAudioCache');
            if (cached) {
                const cacheData = JSON.parse(cached);
                this.audioCache = new Map(cacheData);
            }
        } catch (error) {
            console.error('Failed to load cache:', error);
        }
    }

    saveCacheToStorage() {
        try {
            const cacheData = Array.from(this.audioCache.entries());
            localStorage.setItem('languageChaosAudioCache', JSON.stringify(cacheData));
        } catch (error) {
            console.error('Failed to save cache:', error);
        }
    }

    showError(message) {
        const status = document.getElementById('recordingStatus');
        status.innerHTML = `<span class="error">❌ ${message}</span>`;
        setTimeout(() => {
            status.textContent = '';
        }, 5000);
    }

    showSuccess(message) {
        const status = document.getElementById('recordingStatus');
        status.innerHTML = `<span style="color: #27ae60;">✅ ${message}</span>`;
        setTimeout(() => {
            status.textContent = '';
        }, 3000);
    }

    async sendTypedMessage() {
        const textInput = document.getElementById('textInput');
        const sendTextBtn = document.getElementById('sendTextBtn');
        const text = textInput.value.trim();
        
        if (!text) return;
        
        try {
            // Disable input while processing
            textInput.disabled = true;
            sendTextBtn.disabled = true;
            document.getElementById('recordingStatus').textContent = 'Processing typed message...';
            
            // Transform text using LLM
            const transformedText = await this.transformText(text);
            
            // Convert to speech (without voice cloning for typed messages)
            const audioUrl = await this.textToSpeech(transformedText);
            
            // Send message to other players
            this.sendAudioMessage(audioUrl, transformedText);
            
            // Clear input
            textInput.value = '';
            document.getElementById('recordingStatus').textContent = '';
            
        } catch (error) {
            console.error('Processing typed message failed:', error);
            this.showError('Failed to process typed message. Please try again.');
        } finally {
            // Re-enable input
            textInput.disabled = false;
            sendTextBtn.disabled = false;
            textInput.focus();
        }
    }
}

// Initialize the game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new LanguageChaosGame();
});