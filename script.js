// TLS Handshake & MitM Attack Simulator Logic

document.addEventListener('DOMContentLoaded', () => {
    console.log('Simulator script loaded.');

    // Get DOM elements
    const startButton = document.getElementById('start-simulation');
    const toggleAttackButton = document.getElementById('toggle-attack');
    const clientNode = document.getElementById('client');
    const serverNode = document.getElementById('server');
    const attackerNode = document.getElementById('attacker');
    const messagesDiv = document.getElementById('messages');
    const explanationText = document.getElementById('explanation-text');
    const explanationSection = document.getElementById('explanation'); // Get the parent section
    const quizSection = document.getElementById('quiz');
    const quizContent = document.getElementById('quiz-content');

    // Line elements
    const lineClientServer = document.getElementById('line-client-server');
    const lineClientAttacker = document.getElementById('line-client-attacker');
    const lineAttackerServer = document.getElementById('line-attacker-server');
    const tooltipElement = document.getElementById('tooltip');

    // Quiz Elements
    const quizQuestionElement = document.getElementById('quiz-question');
    const quizOptionsElement = document.getElementById('quiz-options');
    const quizSubmitButton = document.getElementById('quiz-submit');
    const quizFeedbackElement = document.getElementById('quiz-feedback');
    const quizNextButton = document.getElementById('quiz-next');
    const quizRestartButton = document.getElementById('quiz-restart');

    // Simulation Control Elements
    const pauseButton = document.getElementById('pause-simulation');
    const resumeButton = document.getElementById('resume-simulation');
    const replayButton = document.getElementById('replay-simulation');
    const clearButton = document.getElementById('clear-simulation');

    // Raw View Toggle
    const rawViewToggle = document.getElementById('toggle-raw-view');

    // Modal Elements
    const certificateModal = document.getElementById('certificate-modal');
    const modalCloseButton = document.getElementById('modal-close');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalOverlay = document.querySelector('.modal-overlay');

    let isAttackMode = false;
    let simulationRunning = false;
    let isPaused = false; // Pause state
    let resumeNotifier = null; // For resolving the pause promise
    let simulationStopped = false; // Flag to check if simulation was stopped by Clear
    const stepDelay = 1500; // ms delay between steps

    // Define Tooltip Content
    const tooltipContent = {
        'ClientHello': 'Client initiates handshake.\nSends: TLS version, random number, list of supported cipher suites.',
        'ServerHello': 'Server chooses parameters.\nSends: Chosen TLS version, random number, chosen cipher suite, session ID.',
        'Certificate': 'Server proves its identity.\nSends: Server\'s SSL/TLS certificate containing its public key. Client verifies this certificate against trusted Certificate Authorities.',
        'Certificate (Server\'s REAL Cert)': 'Server sends its legitimate certificate to the Attacker.',
        'Certificate (Attacker\'s FAKE Cert)': 'Attacker sends a fake certificate to the Client. Browsers usually show warnings for untrusted certificates!',
        'ServerKeyExchange / ServerHelloDone': 'Server provides data needed for key exchange (e.g., Diffie-Hellman parameters) and indicates it\'s finished sending hello messages.',
        'ClientKeyExchange': 'Client generates a \'pre-master secret\', encrypts it with the Server\'s public key (from the certificate), and sends it. Only the Server (with the private key) can decrypt this.',
        'ClientKeyExchange (Encrypted with FAKE key)': 'Client encrypts the pre-master secret with the Attacker\'s public key (from the fake certificate). The Attacker can decrypt this!',
        'ClientKeyExchange (Encrypted with REAL key)': 'Attacker re-encrypts a secret (possibly the original pre-master secret, or a new one) with the Server\'s real public key.',
        'ChangeCipherSpec': 'A signal indicating that subsequent messages from this point on will be encrypted using the newly negotiated session keys.',
        'Finished (Encrypted)': 'An encrypted message containing a hash of all previous handshake messages. Verifies that the handshake was successful and not tampered with (by someone without the session keys).',
        'ClientHello (Intercepted)': 'Attacker intercepts the initial message from the Client.',
        'Application Data (Encrypted)': 'Actual application data (e.g., HTTP request/response, user data) encrypted using the negotiated session keys. Only the Client and Server can decrypt this.',
        'Application Data (Encrypted, Intercepted)': 'Encrypted application data intercepted by the Attacker. The Attacker can decrypt this because they established the session keys with both Client and Server separately.',
        'Application Data (Re-encrypted)': 'Data that the Attacker decrypted, possibly read or modified, and then re-encrypted using the keys for the other party (Server or Client) before forwarding.',
        // Add more tooltips as needed
    };

    // Sample Certificate Data
    const certificateData = {
        'normal-server': {
            title: "Server Certificate Details",
            issuedTo: "SecureServer.com",
            issuedBy: "Trusted Root CA",
            validFrom: "2023-01-01",
            validTo: "2025-01-01",
            keyType: "RSA (2048 bit)",
            signature: "[Valid Signature]",
            warning: null
        },
        'real-server-mitm': {
            title: "Server Certificate Details (Real)",
            issuedTo: "SecureServer.com",
            issuedBy: "Trusted Root CA",
            validFrom: "2023-01-01",
            validTo: "2025-01-01",
            keyType: "RSA (2048 bit)",
            signature: "[Valid Signature]",
            warning: "(This is the REAL certificate, intercepted by the Attacker)"
        },
        'fake-attacker': {
            title: "Server Certificate Details (FAKE)",
            issuedTo: "SecureServer.com", // Attacker mimics the real CN
            issuedBy: "Untrusted Self-Signed CA", // Attacker signs it themselves
            validFrom: "2024-01-01",
            validTo: "2026-01-01",
            keyType: "RSA (2048 bit)",
            signature: "[INVALID Signature - Not Trusted!]",
            warning: "WARNING: This certificate is NOT trusted! The issuer is unknown or self-signed. This indicates a potential MitM attack."
        }
    };

    // Quiz Data
    const quizQuestions = [
        {
            question: "What is the primary purpose of the Server Certificate message?",
            options: [
                "To encrypt the session",
                "To prove the server's identity",
                "To choose cipher suites",
                "To exchange random numbers"
            ],
            correctAnswer: 1 // Index of the correct option
        },
        {
            question: "In a MitM attack simulation, who receives the ClientKeyExchange message encrypted with the FAKE certificate's public key?",
            options: [
                "The Client",
                "The real Server",
                "The Attacker",
                "Nobody, it fails"
            ],
            correctAnswer: 2
        },
        {
            question: "What does the 'ChangeCipherSpec' message signal?",
            options: [
                "The handshake is complete",
                "An error occurred",
                "Switching to encrypted communication",
                "A new certificate is being sent"
            ],
            correctAnswer: 2
        },
        {
            question: "Why is verifying the server certificate crucial for security?",
            options: [
                "Ensures fastest connection speed",
                "Prevents MitM attacks by confirming server identity",
                "Selects the strongest encryption algorithm",
                "Compresses data for faster transfer"
            ],
            correctAnswer: 1
        }
    ];
    let currentQuestionIndex = 0;
    let score = 0;

    // Initial Explanation Text (Now for the messages area)
    const initialMessagesText = "Click 'Start Handshake' (and optionally 'Inject Attacker') to Begin Simulation.";
    const initialExplanationText = "Hover over messages during the simulation for details on each step."; // New default for explanation

    // Helper function for delays
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Utility function to escape HTML special characters
    function escapeHtml(unsafe) {
        if (!unsafe) return ''; // Handle null or undefined input
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }

    // Event Listeners
    startButton.addEventListener('click', runSimulation);
    toggleAttackButton.addEventListener('click', toggleAttack);
    window.addEventListener('resize', updateLinePositions); // Recalculate on resize
    quizSubmitButton.addEventListener('click', checkAnswer);
    quizNextButton.addEventListener('click', loadNextQuestion);
    quizRestartButton.addEventListener('click', () => { location.reload(); }); // Simple way to restart
    replayButton.addEventListener('click', () => {
        runSimulation();
    });
    clearButton.addEventListener('click', () => {
        simulationStopped = true; // Signal simulation loop to stop
        clearSimulation(true);
    });
    // Modal Listeners
    modalCloseButton.addEventListener('click', hideCertificateModal);
    modalOverlay.addEventListener('click', hideCertificateModal);
    // Click listener for messages (using delegation)
    messagesDiv.addEventListener('click', (event) => {
        // Use closest() to find the clickable message element, even if a child was clicked
        const clickableMessage = event.target.closest('.clickable-certificate');
        if (clickableMessage) {
            const certType = clickableMessage.dataset.certType;
            if (certType) { // Check if certType was found
                 showCertificateModal(certType);
            } else {
                console.warn('Clicked certificate message missing data-cert-type', clickableMessage);
            }
        }
    });

    // Pause/Resume Listeners
    pauseButton.addEventListener('click', () => {
        console.log("Pause button clicked."); // DIAGNOSTIC
        isPaused = true;
        pauseButton.classList.add('hidden');
        resumeButton.classList.remove('hidden');
        clearButton.classList.remove('hidden');
        explanationText.textContent = "Simulation Paused...";
    });

    resumeButton.addEventListener('click', () => {
        console.log("Resume button clicked."); // DIAGNOSTIC
        isPaused = false;
        resumeButton.classList.add('hidden');
        pauseButton.classList.remove('hidden');
        clearButton.classList.add('hidden');
        explanationText.textContent = "Simulation Resuming...";
        // Signal waiting code to continue
        if (resumeNotifier) {
            console.log("Calling resumeNotifier()."); // DIAGNOSTIC
            resumeNotifier();
            resumeNotifier = null;
        } else {
            console.log("resumeNotifier was null."); // DIAGNOSTIC
        }
    });

    // Initial setup
    updateLinePositions();
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Set initial states
    explanationText.textContent = initialExplanationText;
    messagesDiv.innerHTML = `<div class="placeholder-message">${initialMessagesText}</div>`;

    function toggleAttack() {
        isAttackMode = !isAttackMode;
        attackerNode.classList.toggle('hidden', !isAttackMode);
        toggleAttackButton.classList.toggle('active', isAttackMode);
        toggleAttackButton.textContent = isAttackMode ? 'Disable Attacker' : 'Inject Attacker';
        explanationText.textContent = isAttackMode
            ? 'Attack mode enabled. The attacker will intercept the handshake.'
            : 'Attack mode disabled. The handshake will proceed securely.';
        
        // Update lines based on mode
        updateLinePositions(); 

        // Reset simulation if toggled during run?
        // if (simulationRunning) resetSimulation();
        quizContent.innerHTML = '';
    }

    async function runSimulation() {
        clearSimulation(false); // Clear previous state/visuals before starting
        simulationStopped = false; // Reset stop flag for new run

        simulationRunning = true;
        isPaused = false; // Ensure not paused at start
        // Button states: Start/Toggle disabled, Pause shown, Replay/Clear disabled/enabled
        startButton.disabled = true;
        toggleAttackButton.disabled = true;
        pauseButton.classList.remove('hidden');
        resumeButton.classList.add('hidden');
        replayButton.disabled = true; // Disable replay while running
        clearButton.disabled = false;

        explanationText.textContent = "Starting TLS Handshake...";

        try {
            const selectedTlsVersion = document.getElementById('tls-version-select').value;
            if (isAttackMode) {
                console.log("Attempting to run simulateAttackHandshake...");
                await simulateAttackHandshake(selectedTlsVersion);
                console.log("simulateAttackHandshake finished.");
            } else {
                console.log("Attempting to run simulateSecureHandshake...");
                await simulateSecureHandshake(selectedTlsVersion);
                console.log("simulateSecureHandshake finished.");
            }
            console.log("Simulation function finished, attempting to show quiz...");
            showQuiz(); // Show quiz only on successful completion
            replayButton.disabled = false; // <-- Show Replay button on success
            clearButton.disabled = false;
            clearButton.classList.add('hidden'); // <-- Hide Clear button when simulation ends/errors
        } catch (error) {
            if (error.message !== 'Simulation stopped by user') {
                // Only log unexpected errors and show the error message for those
                console.error("Unexpected simulation error during run:", error);
                explanationText.textContent = "An unexpected error occurred during the simulation.";
            } else {
                // Log the intentional stop but don't change the explanation text
                // (it was already set by clearSimulation)
                console.log("Simulation stopped via Clear button.");
            }
            // Error state button resets handled in finally
        } finally {
            console.log("Simulation run finished or errored.");
            simulationRunning = false;
            isPaused = false;
            // Final button states
            startButton.disabled = false;
            toggleAttackButton.disabled = false;
            pauseButton.classList.add('hidden');
            resumeButton.classList.add('hidden');
            replayButton.disabled = false; // Show and enable replay
            replayButton.disabled = false;
            clearButton.disabled = false; // Ensure enabled
            clearButton.classList.add('hidden'); // Hide Clear
        }
    }

    function resetSimulationVisuals() {
        messagesDiv.innerHTML = `<div class="placeholder-message">${initialMessagesText}</div>`; // Set placeholder on reset
        // Reset node styles or positions if needed
        explanationText.textContent = initialExplanationText; // Reset explanation too
        quizSection.classList.add('hidden');
        quizContent.innerHTML = '';
    }

    // Function to calculate and draw lines between nodes
    function updateLinePositions() {
        positionLine(lineClientServer, clientNode, serverNode, !isAttackMode);
        positionLine(lineClientAttacker, clientNode, attackerNode, isAttackMode);
        positionLine(lineAttackerServer, attackerNode, serverNode, isAttackMode);
    }

    function positionLine(lineElement, node1, node2, isVisible) {
        if (!isVisible || node1.classList.contains('hidden') || node2.classList.contains('hidden')) {
            lineElement.classList.add('hidden');
            return;
        }
        lineElement.classList.remove('hidden');

        const simAreaRect = document.getElementById('simulation-area').getBoundingClientRect();
        const rect1 = node1.getBoundingClientRect();
        const rect2 = node2.getBoundingClientRect();

        // Calculate center points relative to the simulation area
        const x1 = rect1.left + rect1.width / 2 - simAreaRect.left;
        const y1 = rect1.top + rect1.height / 2 - simAreaRect.top;
        const x2 = rect2.left + rect2.width / 2 - simAreaRect.left;
        const y2 = rect2.top + rect2.height / 2 - simAreaRect.top;

        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

        lineElement.style.width = `${length}px`;
        lineElement.style.left = `${x1}px`;
        lineElement.style.top = `${y1 - lineElement.offsetHeight / 2}px`; // Center the line vertically
        lineElement.style.transform = `rotate(${angle}deg)`;
    }

    // Helper function to wait if paused
    async function waitForResume() {
        console.log("waitForResume called."); // DIAGNOSTIC
        // Check if stopped first.
        if (simulationStopped) {
            console.log("waitForResume: simulation stopped, throwing error."); // DIAGNOSTIC
            throw new Error('Simulation stopped by user'); // Exit the simulation loop cleanly.
        }
        // Then check if paused.
        if (isPaused) {
            console.log("waitForResume: Simulation is paused. Waiting for resume..."); // DIAGNOSTIC
            // Wait for the resumeNotifier promise to be resolved by the Resume button click.
            await new Promise(resolve => {
                resumeNotifier = resolve;
            });
            console.log("waitForResume: Resumed."); // DIAGNOSTIC
        }
        // Quiz-related UI updates potentially moved here or kept separate.
        quizFeedbackElement.className = '';
        quizRestartButton.classList.remove('hidden');
        // Replay button shown after successful run in runSimulation now
        // replayButton.classList.remove('hidden'); 
    }

    async function simulateSecureHandshake(tlsVersion) {
        console.log(`Simulating secure handshake for ${tlsVersion}...`);
        updateExplanation(`Starting ${tlsVersion} Secure Handshake...`);
        await delay(stepDelay / 2);

        // Version-specific handshake logic.
        switch (tlsVersion) {
            case 'tls1.3':
                // TLS 1.3 handshake steps (condensed).
                await addMessage(clientNode, serverNode, 'ClientHello', tlsVersion);
                updateExplanation('TLS 1.3: Client sends Hello (key share, supported versions, ciphers, sig algs).');
                console.log("Before await waitForResume (TLS 1.3 - 1)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                // Server processes ClientHello, selects params, generates keys, derives early secrets
                await addMessage(serverNode, clientNode, 'ServerHello', tlsVersion);
                updateExplanation('TLS 1.3: Server sends Hello (selected key share, cipher).');
                console.log("Before await waitForResume (TLS 1.3 - 2)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, clientNode, 'EncryptedExtensions', tlsVersion);
                updateExplanation('TLS 1.3: Server sends Encrypted Extensions (e.g., ALPN).');
                console.log("Before await waitForResume (TLS 1.3 - 3)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Optional: Server requests client certificate here if needed (CertificateRequest)
                await addMessage(serverNode, clientNode, 'Certificate (TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3: Server sends its Certificate.');
                console.log("Before await waitForResume (TLS 1.3 - 4)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, clientNode, 'CertificateVerify (TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3: Server proves ownership of its private key.');
                console.log("Before await waitForResume (TLS 1.3 - 5)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, clientNode, 'Finished (Encrypted, TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3: Server Finished (verifies handshake). Client derives master secret.');
                console.log("Before await waitForResume (TLS 1.3 - 6)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                // Client processes Server messages, authenticates server, derives keys
                // Optional: Client sends Certificate and CertificateVerify if requested
                await addMessage(clientNode, serverNode, 'Finished (Encrypted, TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3: Client Finished (verifies handshake). Server derives master secret. Handshake complete!');
                console.log("Before await waitForResume (TLS 1.3 - 7)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                // Application Data uses application traffic secrets derived from master secret
                await addMessage(clientNode, serverNode, 'Application Data (Encrypted, TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3: Secure Application Data flowing.');
                console.log("Before await waitForResume (TLS 1.3 - 8)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, clientNode, 'Application Data (Encrypted, TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3: Secure Application Data flowing.');
                console.log("Before await waitForResume (TLS 1.3 - 9)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                break;

            case 'tls1.2':
            case 'tls1.1':
            case 'tls1.0':
                // TLS 1.0-1.2 handshake steps (example using ECDHE).
                await addMessage(clientNode, serverNode, 'ClientHello', tlsVersion);
                updateExplanation(`${tlsVersion}: Client sends Hello (versions, ciphers, extensions like SNI).`);
                console.log(`Before await waitForResume (${tlsVersion} - 1)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(serverNode, clientNode, 'ServerHello', tlsVersion);
                updateExplanation(`${tlsVersion}: Server sends Hello (chosen version, cipher, session ID).`);
                console.log(`Before await waitForResume (${tlsVersion} - 2)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(serverNode, clientNode, 'Certificate', tlsVersion);
                updateExplanation(`${tlsVersion}: Server sends its Certificate chain.`);
                console.log(`Before await waitForResume (${tlsVersion} - 3)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                // ServerKeyExchange is needed for DHE/ECDHE cipher suites
                await addMessage(serverNode, clientNode, 'ServerKeyExchange', tlsVersion);
                updateExplanation(`${tlsVersion}: Server sends Key Exchange parameters (e.g., EC curve point) signed by its certificate key.`);
                console.log(`Before await waitForResume (${tlsVersion} - 4)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Optional: CertificateRequest if server wants client auth
                await addMessage(serverNode, clientNode, 'ServerHelloDone', tlsVersion);
                updateExplanation(`${tlsVersion}: Server indicates end of its initial messages.`);
                console.log(`Before await waitForResume (${tlsVersion} - 5)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                // Optional: Client sends Certificate if requested
                await addMessage(clientNode, serverNode, 'ClientKeyExchange', tlsVersion);
                updateExplanation(`${tlsVersion}: Client sends its Key Exchange parameters (e.g., its EC point). Both sides calculate pre-master secret.`);
                console.log(`Before await waitForResume (${tlsVersion} - 6)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Both sides calculate master secret from pre-master secret and randoms
                // Now Client sends encrypted messages
                await addMessage(clientNode, serverNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`${tlsVersion}: Client signals switch to encrypted communication using derived keys.`);
                console.log(`Before await waitForResume (${tlsVersion} - 7)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(clientNode, serverNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion}: Client sends encrypted Finished (hash of handshake) to verify key exchange.`);
                console.log(`Before await waitForResume (${tlsVersion} - 8)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                // Server calculates master secret and processes client messages
                await addMessage(serverNode, clientNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`${tlsVersion}: Server signals switch to encrypted communication.`);
                console.log(`Before await waitForResume (${tlsVersion} - 9)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(serverNode, clientNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion}: Server sends encrypted Finished. Handshake complete!`);
                console.log(`Before await waitForResume (${tlsVersion} - 10)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(clientNode, serverNode, 'Application Data (Encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion}: Secure Application Data flowing.`);
                console.log(`Before await waitForResume (${tlsVersion} - 11)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, clientNode, 'Application Data (Encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion}: Secure Application Data flowing.`);
                console.log(`Before await waitForResume (${tlsVersion} - 12)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                break;

            case 'ssl3.0':
                // SSL 3.0 handshake steps (example using RSA).
                // ** Note: SSL 3.0 is insecure **
                await addMessage(clientNode, serverNode, 'ClientHello', tlsVersion);
                updateExplanation(`SSL 3.0: Client sends Hello (max version SSL 3.0, ciphers like RSA_3DES or RSA_RC4).`);
                console.log(`Before await waitForResume (SSL 3.0 - 1)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(serverNode, clientNode, 'ServerHello', tlsVersion);
                updateExplanation(`SSL 3.0: Server sends Hello (chosen version SSL 3.0, cipher like RSA_3DES).`);
                console.log(`Before await waitForResume (SSL 3.0 - 2)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(serverNode, clientNode, 'Certificate', tlsVersion);
                updateExplanation(`SSL 3.0: Server sends its Certificate (RSA key).`);
                console.log(`Before await waitForResume (SSL 3.0 - 3)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                // ServerKeyExchange typically NOT used for RSA key exchange in SSL 3.0
                await addMessage(serverNode, clientNode, 'ServerHelloDone', tlsVersion);
                updateExplanation(`SSL 3.0: Server indicates end of its initial messages.`);
                console.log(`Before await waitForResume (SSL 3.0 - 4)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(clientNode, serverNode, 'ClientKeyExchange', tlsVersion);
                updateExplanation(`SSL 3.0: Client generates pre-master secret, encrypts it with Server's RSA public key.`);
                console.log(`Before await waitForResume (SSL 3.0 - 5)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Both sides calculate master secret
                await addMessage(clientNode, serverNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`SSL 3.0: Client signals switch to encrypted communication.`);
                console.log(`Before await waitForResume (SSL 3.0 - 6)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(clientNode, serverNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0: Client sends encrypted Finished (based on MD5 and SHA-1 hashes).`);
                console.log(`Before await waitForResume (SSL 3.0 - 7)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(serverNode, clientNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`SSL 3.0: Server signals switch to encrypted communication.`);
                console.log(`Before await waitForResume (SSL 3.0 - 8)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(serverNode, clientNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0: Server sends encrypted Finished. Handshake complete! (But insecure!)`);
                console.log(`Before await waitForResume (SSL 3.0 - 9)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;

                await addMessage(clientNode, serverNode, 'Application Data (Encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0: Encrypted Application Data (potentially vulnerable - e.g., POODLE if CBC used).`);
                console.log(`Before await waitForResume (SSL 3.0 - 10)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, clientNode, 'Application Data (Encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0: Encrypted Application Data.`);
                console.log(`Before await waitForResume (SSL 3.0 - 11)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                break;
        }
        updateExplanation(`${tlsVersion} Handshake Complete. Starting Quiz...`); // Final update before quiz.
    }

    // Async function to handle message display with animation
    async function addMessage(from, to, content, tlsVersion) {
        const fromNode = from;
        const toNode = to;
        const messagesContainer = document.getElementById('messages'); // Container for positioning

        if (!fromNode || !toNode) {
            console.error(`Node element not found for message: ${from?.id || 'unknown'} -> ${to?.id || 'unknown'}`);
            // Fallback to logging with IDs if possible, pass the received tlsVersion
            logMessage(from?.id || 'System', to?.id || 'System', content, tlsVersion);
            return;
        }

        // Extract string IDs for logging
        const fromId = fromNode.id; // e.g., 'client', 'server', 'attacker'
        const toId = toNode.id;

        // Create the packet element
        const packet = document.createElement('div');
        packet.classList.add('packet');
        // Optionally add short text inside packet
        // packet.textContent = '✉'; 
        document.body.appendChild(packet); // Add to body for absolute positioning

        // Calculate start and end positions relative to the viewport
        const startRect = fromNode.getBoundingClientRect();
        const endRect = toNode.getBoundingClientRect();
        const containerRect = messagesContainer.getBoundingClientRect();

        // Adjust for scroll position and potential container offset
        const startX = startRect.left + window.scrollX + (startRect.width / 2) - (packet.offsetWidth / 2);
        const startY = startRect.top + window.scrollY + (startRect.height / 2) - (packet.offsetHeight / 2);
        const endX = endRect.left + window.scrollX + (endRect.width / 2) - (packet.offsetWidth / 2);
        const endY = endRect.top + window.scrollY + (endRect.height / 2) - (packet.offsetHeight / 2);

        // Set initial position
        packet.style.left = `${startX}px`;
        packet.style.top = `${startY}px`;

        // Animate the packet
        // We need a small delay to allow the browser to apply the initial position before starting the transition
        await new Promise(resolve => setTimeout(resolve, 50)); 

        packet.style.left = `${endX}px`;
        packet.style.top = `${endY}px`;

        // Wait for the animation to complete (matches CSS transition duration)
        await new Promise(resolve => setTimeout(resolve, 1000)); 

        // Remove the packet after animation
        packet.remove();

        // Add the text message to the log area using the extracted IDs and passing the received version value
        logMessage(fromId, toId, content, tlsVersion);
    }

    // Tooltip Functions
    function showTooltip(event, messageKey) {
        const content = tooltipContent[messageKey] || 'No details available.'; // Fallback content
        tooltipElement.textContent = content;
        tooltipElement.classList.remove('hidden');
        moveTooltip(event); // Position it initially
    }

    function hideTooltip() {
        tooltipElement.classList.add('hidden');
    }

    function moveTooltip(event) {
        // Position tooltip slightly offset from the mouse cursor
        const offsetX = 15; 
        const offsetY = 10;
        let x = event.clientX + offsetX;
        let y = event.clientY + offsetY;

        // Prevent tooltip from going off-screen
        const tooltipRect = tooltipElement.getBoundingClientRect();
        if (x + tooltipRect.width > window.innerWidth) {
            x = event.clientX - tooltipRect.width - offsetX;
        }
        if (y + tooltipRect.height > window.innerHeight) {
            y = event.clientY - tooltipRect.height - offsetY;
        }

        tooltipElement.style.left = `${x + window.scrollX}px`;
        tooltipElement.style.top = `${y + window.scrollY}px`;
    }

    // Adds a textual representation of a message to the messages log area.
    // Handles raw data view, styling, tooltips, and certificate click handlers.
    function logMessage(from, to, content, tlsVersion) {
        // Clear placeholder text only when the first actual message is added
        if (messagesDiv.querySelector('.placeholder-message')) {
            messagesDiv.innerHTML = '';
        }

        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        const showRaw = rawViewToggle.checked;

        // Extract the core message type
        let messageKey = content.split(' (')[0].trim();
        // Handle specific keys if simple split isn't enough
        if (content.includes('ServerKeyExchange / ServerHelloDone')) messageKey = 'ServerKeyExchange / ServerHelloDone';
        if (content.includes('Finished (Encrypted)')) messageKey = 'Finished (Encrypted)';
        if (content.includes('ClientHello (Intercepted)')) messageKey = 'ClientHello (Intercepted)';
        if (content.includes("Certificate (Server's REAL Cert)")) messageKey = "Certificate (Server's REAL Cert)";
        if (content.includes("Certificate (Attacker's FAKE Cert)")) messageKey = "Certificate (Attacker's FAKE Cert)";
        if (content.includes("ClientKeyExchange (Encrypted with FAKE key)")) messageKey = "ClientKeyExchange (Encrypted with FAKE key)";
        if (content.includes("ClientKeyExchange (Encrypted with REAL key)")) messageKey = "ClientKeyExchange (Encrypted with REAL key)";

        // Simplified "Raw" data placeholder
        const rawData = generateRawData(messageKey, tlsVersion);
        let baseHtml = ''; // Store the base message HTML

        // Add specific class based on sender
        if (from.toLowerCase() === 'client') {
            messageElement.classList.add('client-msg');
        } else if (from.toLowerCase() === 'server') {
            messageElement.classList.add('server-msg');
        } else if (from.toLowerCase() === 'attacker') {
            messageElement.classList.add('attacker-msg');
        }

        // Set base content based on message type
        if (messageKey.includes('Certificate')) {
            let certType = 'normal-server'; // Default for secure handshake
            if (messageKey === "Certificate (Server's REAL Cert)") {
                certType = 'real-server-mitm';
            } else if (messageKey === "Certificate (Attacker's FAKE Cert)") {
                certType = 'fake-attacker';
            }

            messageElement.classList.add('clickable-certificate');
            messageElement.style.cursor = 'pointer';
            messageElement.dataset.certType = certType; // Store type

            const strongPart = `<strong>[${escapeHtml(from)} -> ${escapeHtml(to)}]: ${escapeHtml(content)}</strong>`;
            const smallPart = `<small style="font-style: italic; margin-left: 5px;">(Click for details)</small>`;
            baseHtml = strongPart + smallPart;

        } else {
             // For non-certificate messages, just set the main text
             baseHtml = `<strong>[${escapeHtml(from)} -> ${escapeHtml(to)}]: ${escapeHtml(content)}</strong>`;
        }

        messageElement.innerHTML = baseHtml; // Set the base HTML first

        // Add raw data if needed, appending to existing baseHtml
        if (showRaw && rawData) {
            let rawPart = rawData;
            let notesPart = '';
            const notesMarker = '\nNotes:\n';
            const notesIndex = rawData.indexOf(notesMarker);

            if (notesIndex !== -1) {
                rawPart = rawData.substring(0, notesIndex);
                notesPart = rawData.substring(notesIndex + 1); // Get "Notes:\n..." part, skip leading newline
            }

            // Construct the <pre> block content with escaped parts
            let rawHtmlContent = escapeHtml(rawPart);
            if (notesPart) {
                // Add notes part wrapped in a span
                rawHtmlContent += `<span class="raw-notes">${escapeHtml(notesPart)}</span>`;
            }

            messageElement.innerHTML += `<br><pre class="raw-data">${rawHtmlContent}</pre>`;
        }

        messagesDiv.appendChild(messageElement);

        // Scroll to the bottom
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // Add tooltip event listeners if content is available
        if (tooltipContent[messageKey]) {
            messageElement.classList.add('has-tooltip');
            messageElement.addEventListener('mouseover', (e) => showTooltip(e, messageKey));
            messageElement.addEventListener('mousemove', moveTooltip);
            messageElement.addEventListener('mouseout', hideTooltip);
        }

        // Make certificate messages clickable (listeners are added via delegation earlier)
        // The code block below was redundant as click handling is done via delegation
        /*
        if (messageKey.includes('Certificate')) {
            let certType = 'normal-server'; // Default for secure handshake
            if (messageKey === "Certificate (Server's REAL Cert)") {
                certType = 'real-server-mitm';
            } else if (messageKey === "Certificate (Attacker's FAKE Cert)") {
                certType = 'fake-attacker';
            }

            messageElement.classList.add('clickable-certificate');
            messageElement.style.cursor = 'pointer';
            messageElement.dataset.certType = certType; // Store type
        }
        */
    }

    // Helper to generate placeholder raw data
    function generateRawData(messageKey, tlsVersion) {
        const versionMap = {
            'ssl3.0': 'SSL 3.0 (0x0300)',
            'tls1.0': 'TLS 1.0 (0x0301)',
            'tls1.1': 'TLS 1.1 (0x0302)',
            'tls1.2': 'TLS 1.2 (0x0303)',
            'tls1.3': 'TLS 1.2 (0x0303)', // TLS 1.3 uses 0x0303 in record layer for compatibility
        };

        const versionString = versionMap[tlsVersion] || 'TLS 1.2 (0x0303)';
        let rawData = '';
        let notes = '\nNotes:\n'; // Start notes section

        switch(messageKey) {
            case 'ClientHello':
            case 'ClientHello (Intercepted)':
                rawData = `Record Type: Handshake (22)\n  Version: ${versionString}\n  Handshake Type: Client Hello (1)\n    Random: [32 bytes]\n    Cipher Suites Length: 8\n    Cipher Suites (4 suites):\n      Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (0xc02f)\n      Cipher Suite: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (0xc030)\n      Cipher Suite: TLS_RSA_WITH_AES_128_GCM_SHA256 (0x009c)\n      Cipher Suite: TLS_RSA_WITH_AES_256_GCM_SHA384 (0x009d)\n    Extensions (example):\n      Extension: server_name (SNI), Length: 18, Name: SecureServer.com\n      Extension: application_layer_protocol_negotiation (ALPN), Length: 8, Prot: http/1.1`;
                notes += ` - Client proposes highest TLS version it supports and a list of cipher suites.\n`;
                notes += ` - Random value is used later for key generation.\n`;
                notes += ` - SNI extension tells server which hostname client wants to connect to.\n`;
                notes += ` - ALPN suggests application protocols (like HTTP/1.1 or h2).\n`;
                if (tlsVersion === 'tls1.3') {
                    rawData = rawData.replace('TLS 1.2 (0x0303)', 'TLS 1.3 (0x0304) in Handshake Layer'); // Correct inner handshake version for TLS 1.3
                    rawData += '\n      Extension: supported_versions, Version: TLS 1.3 (0x0304)\n      Extension: key_share, Group: secp256r1, Key Exchange: [65 bytes]';
                    notes += ' - TLS 1.3 includes proposed key share material for faster setup.\n';
                    notes += ' - Record Layer Version is TLS 1.2 for compatibility, actual version in extension.\n';
                } else if (tlsVersion === 'ssl3.0') {
                     notes += ' - SSL 3.0 is INSECURE due to POODLE and weak ciphers.\n';
                }
                break;
            case 'ServerHello':
                rawData = `Record Type: Handshake (22)\n  Version: ${versionString}\n  Handshake Type: Server Hello (2)\n    Random: [32 bytes]\n    Session ID Length: 32\n    Session ID: [32 bytes]\n    Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (0xc02f)\n    Extensions (example):\n      Extension: application_layer_protocol_negotiation (ALPN), Length: 8, Prot: http/1.1`;
                notes += ` - Server confirms chosen TLS version and cipher suite.\n`;
                notes += ` - Server provides its own Random value.\n`;
                notes += ` - Session ID can be used for session resumption (faster subsequent handshakes).\n`;
                 if (tlsVersion === 'tls1.3') {
                    rawData = rawData.replace('TLS 1.2 (0x0303)', 'TLS 1.3 (0x0304) in Handshake Layer');
                    rawData += '\n      Extension: supported_versions, Version: TLS 1.3 (0x0304)\n      Extension: key_share, Group: secp256r1, Key Exchange: [65 bytes]';
                    notes += ' - TLS 1.3 selects a key share from client\'s proposals.\n';
                } else if (tlsVersion === 'ssl3.0') {
                    notes += ' - SSL 3.0 handshake details differ significantly (e.g., no extensions shown here).\n';
                    notes += ' - Still INSECURE!\n';
                }
                break;
            case 'Certificate':
            case "Certificate (Server's REAL Cert)":
            case "Certificate (Attacker's FAKE Cert)":
                 let issuer = messageKey.includes("FAKE") ? "Untrusted Self-Signed CA" : "Trusted Root CA";
                 let subject = "CN=SecureServer.com";
                 rawData = `Record Type: Handshake (22)\n  Version: ${versionString}\n  Handshake Type: Certificate (11)\n    Certificates Length: [Total Length]\n    Certificate Chain Length: [Chain Length]\n      Certificate Length: [Cert 1 Length]\n        Subject: ${subject}\n        Issuer: ${issuer}\n        Serial Number: [Example Serial]\n        Validity: Not Before: Jan 1 2023, Not After: Jan 1 2025\n        Public Key: RSA (2048 bit)\n      Certificate Length: [Cert 2 Length (if any)]\n        Subject: ${issuer}\n        Issuer: [Higher Level CA or Self]`;
                 notes += ` - Contains the server's public key and identity information.\n`;
                 notes += ` - Client MUST verify the certificate chain against its trusted root CAs.\n`;
                 if (messageKey.includes("FAKE")) {
                    notes += ` - WARNING: Fake certificate! Issuer is untrusted. Classic MitM sign.\n`;
                 } else if (messageKey.includes("REAL")) {
                    notes += ` - This is the real certificate, intercepted by the attacker.\n`;
                 }
                 if (tlsVersion === 'ssl3.0') {
                    notes += ' - Certificate validation is crucial, but SSL 3.0 weaknesses might bypass some checks.\n';
                 }
                break;
            case 'ServerKeyExchange / ServerHelloDone':
                 rawData = `Record Type: Handshake (22)\n  Version: ${versionString}\n  Handshake Type: Server Key Exchange (12)\n    EC Diffie-Hellman Server Params:\n      Curve Type: named_curve (3)\n      Named Curve: secp256r1 (0x0017)\n      Pubkey: [65 bytes Uncompressed Point]\n      Signature Algorithm: rsa_pkcs1_sha256 (0x0401)\n      Signature: [Encrypted Hash of Params]\n-- THEN --\nRecord Type: Handshake (22)\n  Version: ${versionString}\n  Handshake Type: Server Hello Done (14)`;
                 notes += ` - ServerKeyExchange is needed for ephemeral key agreement (like DHE/ECDHE).\n`;
                 notes += ` - Contains parameters (e.g., DH public value) signed by server's long-term key (from certificate).\n`;
                 notes += ` - ServerHelloDone indicates server finished sending its initial messages.\n`;
                 if (tlsVersion === 'ssl3.0') {
                    notes += ' - ServerKeyExchange not typically used for RSA key exchange in SSL 3.0.\n';
                 }
                break;
            case 'ClientKeyExchange':
            case "ClientKeyExchange (Encrypted with FAKE key)":
            case "ClientKeyExchange (Encrypted with REAL key)":
                rawData = `Record Type: Handshake (22)\n  Version: ${versionString}\n  Handshake Type: Client Key Exchange (16)\n    Encrypted PreMaster Secret: [Length (e.g., 256 bytes for RSA)]`;
                notes += ` - Contains client's contribution to the key material.\n`;
                if (tlsVersion === 'ssl3.0' || tlsVersion === 'tls1.0' || tlsVersion === 'tls1.1' || tlsVersion === 'tls1.2') {
                    // Example for RSA Key Exchange (common in older versions or non-PFS ciphers)
                    notes += ` - For RSA key exchange: Contains the Pre-Master Secret, encrypted with server's public key.\n`;
                    // Example for ECDHE (more modern)
                    // notes += ` - For ECDHE: Contains the client's ephemeral public key.\n`;
                }
                if (messageKey.includes("FAKE key")) {
                    notes += ` - Encrypted with ATTACKER's public key! Attacker can decrypt the secret.\n`;
                } else if (messageKey.includes("REAL key")) {
                     notes += ` - Attacker re-encrypts secret with REAL server key to forward it.\n`;
                }
                break;
            case 'ChangeCipherSpec':
                rawData = `Record Type: Change Cipher Spec (20)\n  Version: ${versionString}\n  Message: [1]`;
                notes += ` - Signals that subsequent records will be encrypted with the newly negotiated keys.\n`;
                notes += ` - It's actually a separate record type, not technically a handshake message.\n`;
                break;
            case 'Finished (Encrypted)':
                rawData = `Record Type: Handshake (22) - Encrypted Handshake Message\n  Version: ${versionString}\n    Handshake Type: Finished (20)\n    Verify Data: [12 bytes for TLS 1.2]`;
                notes += ` - First encrypted message. Contains hash of all preceding handshake messages.\n`;
                notes += ` - Verifies integrity of the handshake and confirms key exchange success.\n`;
                if (tlsVersion === 'ssl3.0') {
                    notes += ` - SSL 3.0 uses weaker hashes (MD5+SHA1) making it less secure.\n`;
                }
                break;
            case 'Application Data (Encrypted)':
            case 'Application Data (Encrypted, Intercepted)':
            case 'Application Data (Re-encrypted)':
                 rawData = `Record Type: Application Data (23)\n  Version: ${versionString}\n  Encrypted Application Data: [Variable Length + Auth Tag (GCM)]`;
                 notes += ` - Actual application payload (e.g., HTTP request/response) encrypted using session keys.\n`;
                 if (messageKey.includes("Intercepted")) {
                     notes += ` - Attacker decrypts this using keys established with the sender.\n`;
                 } else if (messageKey.includes("Re-encrypted")) {
                     notes += ` - Attacker re-encrypts (possibly modified) data using keys for the receiver.\n`;
                 }
                 if (tlsVersion === 'ssl3.0') {
                    notes += ' - If using CBC ciphers, vulnerable to POODLE attack!\n';
                 }
                break;
            default:
                return null; // No raw data for other types
        }

        // Append notes if any were added
        if (notes !== '\nNotes:\n') {
            rawData += notes;
        }

        return rawData;
    }

    // Quiz Functions ------------------------------------------
    function showQuiz() {
        console.log("Executing showQuiz function...");
        currentQuestionIndex = 0;
        score = 0;
        loadQuizQuestion(currentQuestionIndex);
        quizSection.classList.remove('hidden');
        quizFeedbackElement.textContent = '';
        quizFeedbackElement.className = ''; // Reset feedback style
        quizRestartButton.classList.add('hidden');
    }

    function loadQuizQuestion(index) {
        console.log(`loadQuizQuestion called with index: ${index}`); // Log entry
        if (index >= quizQuestions.length) {
            console.log("Quiz finished, calling showResults.");
            showResults();
            return;
        }

        console.log("Getting question data for index:", index);
        const questionData = quizQuestions[index];
        if (!questionData) {
            console.error("Error: Could not find question data for index", index);
            return;
        }

        console.log("Setting question text element:", quizQuestionElement);
        quizQuestionElement.textContent = questionData.question;
        console.log("Clearing options element:", quizOptionsElement);
        quizOptionsElement.innerHTML = ''; // Clear previous options

        console.log("Looping through options:", questionData.options);
        questionData.options.forEach((option, i) => {
            console.log(`Creating option ${i}: ${option}`);
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'quizOption';
            radio.value = i;
            radio.id = `option${i}`;

            label.appendChild(radio);
            label.appendChild(document.createTextNode(option)); // Add text node for the option
            quizOptionsElement.appendChild(label);
        });

        console.log("Showing Submit button, hiding Next button.");
        quizSubmitButton.classList.remove('hidden');
        quizNextButton.classList.add('hidden');
        quizFeedbackElement.textContent = '';
        quizFeedbackElement.className = '';
        console.log("loadQuizQuestion finished for index:", index);
    }

    function checkAnswer() {
        const selectedOption = quizOptionsElement.querySelector('input[name="quizOption"]:checked');
        if (!selectedOption) {
            quizFeedbackElement.textContent = "Please select an answer.";
            quizFeedbackElement.className = 'incorrect';
            return;
        }

        const answerIndex = parseInt(selectedOption.value);
        const questionData = quizQuestions[currentQuestionIndex];

        if (answerIndex === questionData.correctAnswer) {
            quizFeedbackElement.textContent = "Correct!";
            quizFeedbackElement.className = 'correct';
            score++;
        } else {
            quizFeedbackElement.textContent = `Incorrect. The correct answer was: ${questionData.options[questionData.correctAnswer]}`;
            quizFeedbackElement.className = 'incorrect';
        }

        // Disable options after answering
        quizOptionsElement.querySelectorAll('input[name="quizOption"]').forEach(input => input.disabled = true);

        quizSubmitButton.classList.add('hidden');
        quizNextButton.classList.remove('hidden');
    }

    function loadNextQuestion() {
        currentQuestionIndex++;
        loadQuizQuestion(currentQuestionIndex);
        // Re-enable options for the new question (handled inside loadQuizQuestion by clearing/recreating)
    }

    function showResults() {
        quizQuestionElement.textContent = `Quiz Complete!`;
        quizOptionsElement.innerHTML = `<p>Your score: ${score} out of ${quizQuestions.length}</p>`;
        quizSubmitButton.classList.add('hidden');
        quizNextButton.classList.add('hidden');
        quizFeedbackElement.textContent = '';
        quizFeedbackElement.className = '';
        quizRestartButton.classList.remove('hidden');
    }

    // End Quiz Functions --------------------------------------

    // Function to clear simulation state and visuals
    function clearSimulation(resetExplanation = true) {
        console.log("Clearing simulation...");
        simulationRunning = false;
        simulationStopped = true; // Ensure any running loops stop
        isPaused = false;
        if (resumeNotifier) { // Ensure any pending pause is resolved
             resumeNotifier();
             resumeNotifier = null;
        }
        resetSimulationVisuals(); // Clear messages, etc.
        // Reset explanation text via helper function
        updateExplanation(initialExplanationText);
        // Reset button states
        startButton.disabled = false;
        toggleAttackButton.disabled = false;
        pauseButton.classList.add('hidden');
        resumeButton.classList.add('hidden');
        replayButton.disabled = true; // Disable replay when simulation ends
        clearButton.disabled = false;
        clearButton.classList.add('hidden'); // <-- Hide Clear button when cleared
        quizSection.classList.add('hidden'); // Hide quiz
    }

    // Modal Functions
    function showCertificateModal(certType) {
        const data = certificateData[certType];
        if (!data) {
            console.error("Invalid certificate type for modal:", certType);
            return;
        }

        modalTitle.textContent = data.title;
        modalBody.innerHTML = `            <p><strong>Issued To:</strong> ${data.issuedTo}</p>
            <p><strong>Issued By:</strong> ${data.issuedBy}</p>
            <p><strong>Valid From:</strong> ${data.validFrom}</p>
            <p><strong>Valid To:</strong> ${data.validTo}</p>
            <p><strong>Key Type:</strong> ${data.keyType}</p>
            <p><strong>Signature:</strong> ${data.signature}</p>
            ${data.warning ? `<p style="color: red; font-weight: bold; margin-top: 15px;">${data.warning}</p>` : ''}
        `;

        certificateModal.classList.remove('hidden');
    }

    function hideCertificateModal() {
        certificateModal.classList.add('hidden');
    }

    // Helper function to update the main explanation text and highlight the section
    function updateExplanation(text) {
        explanationText.textContent = text;
        // Apply highlight animation
        explanationSection.classList.remove('step-highlight'); // Remove first to allow re-trigger
        // Force reflow/repaint before adding class again - setTimeout is a common way
        void explanationSection.offsetWidth; // Trigger reflow (alternative to setTimeout)
        explanationSection.classList.add('step-highlight');
    }

    async function simulateAttackHandshake(tlsVersion) {
        console.log(`Simulating MitM attack for ${tlsVersion}...`);
        updateExplanation(`Starting ${tlsVersion} MitM Attack Simulation...`);
        await delay(stepDelay / 2);

        // Version-specific MitM handshake logic.
        switch (tlsVersion) {
            case 'tls1.3':
                 // MitM flow for TLS 1.3 (simplified - real MitM is harder).
                // Attacker establishes separate sessions with client and server.
                await addMessage(clientNode, attackerNode, 'ClientHello (Intercepted)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts ClientHello.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 1)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'ClientHello', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker forwards ClientHello to Server.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 2)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'ServerHello', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts ServerHello.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 3)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'EncryptedExtensions', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts EncryptedExtensions.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 4)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Certificate (TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts Server Certificate.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 5)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'CertificateVerify (TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts Server CertificateVerify.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 6)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Finished (Encrypted, TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts Server Finished.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 7)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Attacker now talks to client (using fake cert etc)
                await addMessage(attackerNode, clientNode, 'ServerHello', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker sends own ServerHello to Client.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 8)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'EncryptedExtensions', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker sends own EncryptedExtensions.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 9)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Certificate (Attacker FAKE Cert)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker sends FAKE Certificate to Client.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 10)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'CertificateVerify (TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker sends own CertificateVerify.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 11)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Finished (Encrypted, TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker sends own Finished to Client.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 12)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Client finishes its side
                await addMessage(clientNode, attackerNode, 'Finished (Encrypted, TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts Client Finished.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 13)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Attacker forwards to server
                await addMessage(attackerNode, serverNode, 'Finished (Encrypted, TLS 1.3)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker forwards Finished to Server. Handshake complete (MitM!).');
                console.log("Before await waitForResume (MitM TLS 1.3 - 14)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Application Data Flow (Intercepted)
                await addMessage(clientNode, attackerNode, 'Application Data (Encrypted, Intercepted)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts encrypted data from Client.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 15)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'Application Data (Re-encrypted)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker re-encrypts and forwards data to Server.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 16)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Application Data (Encrypted, Intercepted)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker intercepts encrypted data from Server.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 17)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Application Data (Re-encrypted)', tlsVersion);
                updateExplanation('TLS 1.3 MitM: Attacker re-encrypts and forwards data to Client.');
                console.log("Before await waitForResume (MitM TLS 1.3 - 18)"); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                break;

            case 'tls1.2':
            case 'tls1.1':
            case 'tls1.0':
                 // MitM flow for TLS 1.0-1.2 (example assuming ECDHE).
                await addMessage(clientNode, attackerNode, 'ClientHello (Intercepted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts ClientHello.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 1)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'ClientHello', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker forwards ClientHello to Server.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 2)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'ServerHello', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts ServerHello.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 3)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Certificate (Server REAL Cert)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts REAL Server Certificate.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 4)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'ServerKeyExchange', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts ServerKeyExchange.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 5)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'ServerHelloDone', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts ServerHelloDone.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 6)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Attacker talks to client
                await addMessage(attackerNode, clientNode, 'ServerHello', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker sends own ServerHello to Client.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 7)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Certificate (Attacker FAKE Cert)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker sends FAKE Certificate to Client.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 8)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'ServerKeyExchange', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker performs own KeyExchange with Client.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 9)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'ServerHelloDone', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker sends own ServerHelloDone.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 10)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Client sends its part
                await addMessage(clientNode, attackerNode, 'ClientKeyExchange', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts ClientKeyExchange.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 11)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(clientNode, attackerNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts Client ChangeCipherSpec.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 12)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(clientNode, attackerNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts Client Finished.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 13)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Attacker forwards (potentially modified) to server
                await addMessage(attackerNode, serverNode, 'ClientKeyExchange', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker forwards ClientKeyExchange to Server.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 14)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker sends ChangeCipherSpec to Server.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 15)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker sends Finished to Server.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 16)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Server sends its final part
                await addMessage(serverNode, attackerNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts Server ChangeCipherSpec.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 17)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts Server Finished.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 18)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Attacker sends final part to client
                await addMessage(attackerNode, clientNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker sends ChangeCipherSpec to Client.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 19)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker sends Finished to Client. Handshake complete (MitM!).`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 20)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Application Data Flow
                await addMessage(clientNode, attackerNode, 'Application Data (Encrypted, Intercepted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts encrypted data from Client.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 21)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'Application Data (Re-encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker re-encrypts and forwards data to Server.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 22)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Application Data (Encrypted, Intercepted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker intercepts encrypted data from Server.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 23)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Application Data (Re-encrypted)', tlsVersion);
                updateExplanation(`${tlsVersion} MitM: Attacker re-encrypts and forwards data to Client.`);
                console.log(`Before await waitForResume (MitM ${tlsVersion} - 24)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                break;

            case 'ssl3.0':
                 // MitM flow for SSL 3.0 (example using RSA).
                await addMessage(clientNode, attackerNode, 'ClientHello (Intercepted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts ClientHello.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 1)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'ClientHello', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker forwards ClientHello.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 2)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'ServerHello', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts ServerHello.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 3)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Certificate (Server REAL Cert)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts REAL Server Certificate.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 4)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'ServerHelloDone', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts ServerHelloDone.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 5)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Attacker to Client
                await addMessage(attackerNode, clientNode, 'ServerHello', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker sends own ServerHello to Client.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 6)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Certificate (Attacker FAKE Cert)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker sends FAKE Certificate to Client.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 7)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'ServerHelloDone', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker sends own ServerHelloDone.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 8)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Client -> Attacker
                await addMessage(clientNode, attackerNode, 'ClientKeyExchange (Encrypted with FAKE key)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts ClientKeyExchange (can decrypt!).`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 9)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(clientNode, attackerNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts Client ChangeCipherSpec.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 10)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(clientNode, attackerNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts Client Finished.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 11)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Attacker -> Server
                await addMessage(attackerNode, serverNode, 'ClientKeyExchange (Encrypted with REAL key)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker re-encrypts/sends KeyExchange to Server.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 12)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker sends ChangeCipherSpec to Server.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 13)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker sends Finished to Server.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 14)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Server -> Attacker
                await addMessage(serverNode, attackerNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts Server ChangeCipherSpec.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 15)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts Server Finished.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 16)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                // Attacker -> Client
                await addMessage(attackerNode, clientNode, 'ChangeCipherSpec', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker sends ChangeCipherSpec to Client.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 17)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Finished (Encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker sends Finished to Client. Handshake complete (MitM!).`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 18)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                 // Application Data Flow
                await addMessage(clientNode, attackerNode, 'Application Data (Encrypted, Intercepted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts encrypted data from Client.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 19)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, serverNode, 'Application Data (Re-encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker re-encrypts data to Server.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 20)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(serverNode, attackerNode, 'Application Data (Encrypted, Intercepted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker intercepts encrypted data from Server.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 21)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                await addMessage(attackerNode, clientNode, 'Application Data (Re-encrypted)', tlsVersion);
                updateExplanation(`SSL 3.0 MitM: Attacker re-encrypts data to Client.`);
                console.log(`Before await waitForResume (MitM SSL 3.0 - 22)`); // DIAGNOSTIC
                await waitForResume(); if (simulationStopped) return;
                break;
        }
        updateExplanation(`${tlsVersion} MitM Attack Complete. Starting Quiz...`); // Final update before quiz.
    }
});
