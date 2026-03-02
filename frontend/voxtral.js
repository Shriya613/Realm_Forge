/**
 * voxtral.js — Push-to-talk voice command system
 * Uses Voxtral (Mistral Audio) for transcription.
 * Hold V or use the 🎤 button to speak an action.
 */

class PushToTalk {
    constructor(onTranscribed) {
        this.onTranscribed = onTranscribed;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.stream = null;
        this.initKeyboard();
    }

    async initMicrophone() {
        if (this.stream) return;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            console.error('Microphone access denied:', e);
        }
    }

    initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyV' && !e.repeat && !this.isRecording) {
                // Don't capture V if user is typing in a text input
                if (document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.tagName === 'TEXTAREA') return;
                this.startRecording();
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'KeyV') this.stopRecording();
        });
    }

    async startRecording() {
        await this.initMicrophone();
        if (!this.stream || this.isRecording) return;

        this.audioChunks = [];
        this.isRecording = true;

        this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm'
        });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.start(100);

        // Update voice button UI
        const btn = document.getElementById('btn-voice');
        if (btn) { btn.classList.add('live'); btn.title = 'Recording… release V to send'; }
        this._addCommsMsg('🎤 Voice active — speak your command...');
    }

    async stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;
        this.isRecording = false;

        // Wait for stop + final data
        await new Promise(resolve => {
            this.mediaRecorder.onstop = resolve;
            this.mediaRecorder.stop();
        });

        const btn = document.getElementById('btn-voice');
        if (btn) { btn.classList.remove('live'); btn.title = 'Hold V for push-to-talk'; }

        if (this.audioChunks.length === 0) return;

        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const b64 = await this._blobToBase64(blob);

        this._addCommsMsg('⌛ Transcribing...');

        try {
            const res = await fetch('http://127.0.0.1:8000/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio_b64: b64 })
            });
            const data = await res.json();
            if (data.status === 'success' && data.text) {
                this._addCommsMsg(`🗣️ You: "${data.text}"`);
                this.onTranscribed(data.text);
            } else {
                this._addCommsMsg('❌ Could not understand. Try again or use text.');
            }
        } catch (e) {
            this._addCommsMsg('❌ Voice error — check backend connection.');
            console.error('[Voxtral]', e);
        }
    }

    _blobToBase64(blob) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
        });
    }

    _addCommsMsg(msg) {
        // Reuse the existing addChatMsg if available in global scope
        if (typeof addChatMsg === 'function') {
            addChatMsg(msg, 'system');
        } else {
            const feed = document.getElementById('chat-feed');
            if (feed) {
                const el = document.createElement('div');
                el.className = 'chat-msg system';
                el.textContent = msg;
                feed.appendChild(el);
                feed.scrollTop = feed.scrollHeight;
            }
        }
    }
}

export { PushToTalk };
