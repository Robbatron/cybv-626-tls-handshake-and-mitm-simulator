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
        isPaused = true;
        pauseButton.classList.add('hidden');
        resumeButton.classList.remove('hidden');
        clearButton.classList.remove('hidden');
        explanationText.textContent = "Simulation Paused...";
    });

    resumeButton.addEventListener('click', () => {
        isPaused = false;
        resumeButton.classList.add('hidden');
        pauseButton.classList.remove('hidden');
        clearButton.classList.add('hidden');
        explanationText.textContent = "Simulation Resuming...";
        // Signal waiting code to continue
        if (resumeNotifier) {
            resumeNotifier();
            resumeNotifier = null;
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
            if (isAttackMode) {
                console.log("Attempting to run simulateAttackHandshake...");
                await simulateAttackHandshake();
                console.log("simulateAttackHandshake finished.");
            } else {
                console.log("Attempting to run simulateSecureHandshake...");
                await simulateSecureHandshake();
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
        // Check if stopped first
        if (simulationStopped) {
            throw new Error('Simulation stopped by user');
        }
        // Then check if paused
        if (isPaused) {
            await new Promise(resolve => {
                resumeNotifier = resolve;
            });
        }
        quizFeedbackElement.className = '';
        quizRestartButton.classList.remove('hidden');
        // Replay button shown after successful run in runSimulation now
        // replayButton.classList.remove('hidden'); 
    }

    async function simulateSecureHandshake() {
        console.log("Simulating SECURE handshake...");
        try {
            // 1. ClientHello
            await waitForResume();
            updateExplanation("Step 1: Client sends ClientHello (supported cipher suites, TLS version).");
            await addMessage('Client', 'Server', 'ClientHello');
            await waitForResume();
            await delay(stepDelay);

            // 2. ServerHello
            await waitForResume();
            updateExplanation("Step 2: Server responds with ServerHello (chosen cipher suite, session ID).");
            await addMessage('Server', 'Client', 'ServerHello');
            await waitForResume();
            await delay(stepDelay);

            // 3. Certificate
            await waitForResume();
            updateExplanation("Step 3: Server sends its Certificate (containing its public key).");
            await addMessage('Server', 'Client', 'Certificate');
            await waitForResume();
            await delay(stepDelay);

            // 4. Server Key Exchange / ServerHelloDone (Simplified)
            await waitForResume();
            updateExplanation("Step 4: Server sends key exchange parameters and signals end of its hello phase.");
            await addMessage('Server', 'Client', 'ServerKeyExchange / ServerHelloDone');
            await waitForResume();
            await delay(stepDelay);

            // 5. Client Key Exchange
            await waitForResume();
            updateExplanation("Step 5: Client verifies certificate, generates pre-master secret, encrypts it with Server's public key, and sends it.");
            await addMessage('Client', 'Server', 'ClientKeyExchange');
            await waitForResume();
            await delay(stepDelay);

            // --> ADD Key Derivation Step <--
            await waitForResume();
            updateExplanation("Step 5.5: Client & Server derive Master Secret from Pre-Master Secret and Randoms, then derive Session Keys.");
            await delay(stepDelay / 2); // Shorter pause

            // Both derive session keys now (implicitly)
            await waitForResume();
            updateExplanation("Step 6: Both Client and Server derive symmetric session keys from the exchanged secrets.");
            await waitForResume();
            await delay(stepDelay);

            // 7. ChangeCipherSpec (Client)
            await waitForResume();
            updateExplanation("Step 7: Client signals it will now use the new session keys.");
            await addMessage('Client', 'Server', 'ChangeCipherSpec');
            await waitForResume();
            await delay(stepDelay);

            // 8. Finished (Client)
            await waitForResume();
            updateExplanation("Step 8: Client sends encrypted Finished message to verify key exchange.");
            await addMessage('Client', 'Server', 'Finished (Encrypted)');
            await waitForResume();
            await delay(stepDelay);

            // 9. ChangeCipherSpec (Server)
            await waitForResume();
            updateExplanation("Step 9: Server signals it will now use the new session keys.");
            await addMessage('Server', 'Client', 'ChangeCipherSpec');
            await waitForResume();
            await delay(stepDelay);

            // 10. Finished (Server)
            await waitForResume();
            updateExplanation("Step 10: Server sends encrypted Finished message to verify key exchange.");
            await addMessage('Server', 'Client', 'Finished (Encrypted)');
            await waitForResume();
            await delay(stepDelay);

            // Handshake Complete
            await waitForResume();
            updateExplanation("Secure handshake complete! Encrypted application data can now be exchanged.");
            await delay(stepDelay); // Pause briefly after handshake completes

            // Post-Handshake Data Exchange
            await waitForResume();
            updateExplanation("Step 11: Client sends encrypted application data.");
            await addMessage('Client', 'Server', 'Application Data (Encrypted)');
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("Step 12: Server sends encrypted application data.");
            await addMessage('Server', 'Client', 'Application Data (Encrypted)');
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("End of Secure Simulation.");

        } catch (error) {
            console.error("Simulation error:", error);
            explanationText.textContent = "An error occurred during the simulation.";
            throw error; // Re-throw error to be caught by runSimulation
        } finally {
            // Remove button state logic from here
            // simulationRunning = false; // Handled by runSimulation
            // isPaused = false;
            // startButton.disabled = false;
            // toggleAttackButton.disabled = false;
            // pauseButton.classList.add('hidden');
            // resumeButton.classList.add('hidden');
            // replayButton.disabled = false; 
            // clearButton.disabled = false;
        }
    }

    async function simulateAttackHandshake() {
        console.log("Simulating MitM ATTACK handshake...");
        const attackerNode = document.getElementById('attacker');
        if (attackerNode.classList.contains('hidden')) {
            console.warn("Attack simulation started but attacker node is hidden.");
            attackerNode.classList.remove('hidden');
        }

        try {
            await waitForResume();
            updateExplanation("Simulating MitM ATTACK... Attacker intercepts connection.");
            await waitForResume();
            await delay(stepDelay);

            // 1. Client sends ClientHello, intercepted by Attacker
            await waitForResume();
            updateExplanation("Step 1 (Attack): Client sends ClientHello, but it's intercepted by the Attacker.");
            await addMessage('Client', 'Attacker', 'ClientHello (Intercepted)');
            await waitForResume();
            await delay(stepDelay);

            // 2. Attacker initiates its own handshake with Server
            await waitForResume();
            updateExplanation("Step 2 (Attack): Attacker forwards ClientHello (or a modified version) to the Server.");
            await addMessage('Attacker', 'Server', 'ClientHello');
            await waitForResume();
            await delay(stepDelay);

            // 3. Server responds to Attacker
            await waitForResume();
            updateExplanation("Step 3 (Attack): Server responds to Attacker with ServerHello.");
            await addMessage('Server', 'Attacker', 'ServerHello');
            await waitForResume();
            await delay(stepDelay);
            await waitForResume();
            updateExplanation("Step 4 (Attack): Server sends its REAL Certificate to the Attacker.");
            await addMessage('Server', 'Attacker', 'Certificate (Server\'s REAL Cert)');
            await waitForResume();
            await delay(stepDelay);
            await waitForResume();
            updateExplanation("Step 5 (Attack): Server sends key exchange details to the Attacker.");
            await addMessage('Server', 'Attacker', 'ServerKeyExchange / ServerHelloDone');
            await waitForResume();
            await delay(stepDelay);

            // 4. Attacker responds to Client, posing as Server
            await waitForResume();
            updateExplanation("Step 6 (Attack): Attacker sends ServerHello back to the Client (posing as Server).");
            await addMessage('Attacker', 'Client', 'ServerHello');
            await waitForResume();
            await delay(stepDelay);
            await waitForResume();
            updateExplanation("Step 7 (Attack): Attacker sends a FAKE Certificate to the Client! Client might warn or proceed.");
            await addMessage('Attacker', 'Client', 'Certificate (Attacker\'s FAKE Cert)');
            await waitForResume();
            await delay(stepDelay);
            await waitForResume();
            updateExplanation("Step 8 (Attack): Attacker sends key exchange details to the Client.");
            await addMessage('Attacker', 'Client', 'ServerKeyExchange / ServerHelloDone');
            await waitForResume();
            await delay(stepDelay);

            // 5. Client sends encrypted data to Attacker (thinking it's Server)
            await waitForResume();
            updateExplanation("Step 9 (Attack): Client (thinking it talks to Server) sends encrypted pre-master secret using Attacker\'s FAKE public key.");
            await addMessage('Client', 'Attacker', 'ClientKeyExchange (Encrypted with FAKE key)');
            await waitForResume();
            await delay(stepDelay);
            await waitForResume();
            updateExplanation("Step 10 (Attack): Attacker DECRYPTS the Client's message using its private key.");
            // No visual message for decryption, just text explanation
            await waitForResume();
            await delay(stepDelay);
            await waitForResume();
            updateExplanation("Step 11 (Attack): Client sends ChangeCipherSpec & Finished to Attacker.");
            await addMessage('Client', 'Attacker', 'ChangeCipherSpec');
            await waitForResume(); // Added wait before second message
            await addMessage('Client', 'Attacker', 'Finished (Encrypted)');
            await waitForResume();
            await delay(stepDelay);

            // --> ADD Key Derivation Step (Client <-> Attacker) <--
            await waitForResume();
            updateExplanation("Step 11.5 (Attack): Client & Attacker (posing as Server) derive Session Keys for Client<->Attacker leg.");
            await delay(stepDelay / 2); // Shorter pause

            // 6. Attacker completes handshake with Server (thinking it's Client)
            await waitForResume();
            updateExplanation("Step 12 (Attack): Attacker sends ClientKeyExchange to Server (encrypted with Server\'s REAL public key).");
            await addMessage('Attacker', 'Server', 'ClientKeyExchange (Encrypted with REAL key)');
            await waitForResume();
            await delay(stepDelay);
            await waitForResume();
            updateExplanation("Step 13 (Attack): Attacker sends ChangeCipherSpec & Finished to Server.");
            await addMessage('Attacker', 'Server', 'ChangeCipherSpec');
            await waitForResume(); // Added wait before second message
            await addMessage('Attacker', 'Server', 'Finished (Encrypted)');
            await waitForResume();
            await delay(stepDelay);

            // --> ADD Key Derivation Step (Attacker <-> Server) <--
            await waitForResume();
            updateExplanation("Step 13.5 (Attack): Attacker (posing as Client) & Server derive Session Keys for Attacker<->Server leg.");
            await delay(stepDelay / 2); // Shorter pause

            // 7. Server responds to Attacker
            await waitForResume();
            updateExplanation("Step 14 (Attack): Server completes its side of the handshake with Attacker.");
            await addMessage('Server', 'Attacker', 'ChangeCipherSpec');
            await waitForResume(); // Added wait before second message
            await addMessage('Server', 'Attacker', 'Finished (Encrypted)');
            await waitForResume();
            await delay(stepDelay);

            // 8. Attacker responds to Client
            await waitForResume();
            updateExplanation("Step 15 (Attack): Attacker completes its side of the handshake with Client.");
            await addMessage('Attacker', 'Client', 'ChangeCipherSpec');
            await waitForResume(); // Added wait before second message
            await addMessage('Attacker', 'Client', 'Finished (Encrypted)');
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("MitM Attack Successful! Attacker sits between Client and Server, decrypting traffic.");
            await delay(stepDelay); // Pause briefly after handshake

            // Post-Handshake Data Exchange (Intercepted)
            await waitForResume();
            updateExplanation("Step 16 (Attack): Client sends encrypted data, intercepted by Attacker.");
            await addMessage('Client', 'Attacker', 'Application Data (Encrypted, Intercepted)');
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("Step 17 (Attack): Attacker decrypts, reads (and potentially modifies) the data.");
            // No visual for decryption, just text
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("Step 18 (Attack): Attacker re-encrypts and forwards data to Server.");
            await addMessage('Attacker', 'Server', 'Application Data (Re-encrypted)');
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("Step 19 (Attack): Server sends encrypted data, intercepted by Attacker.");
            await addMessage('Server', 'Attacker', 'Application Data (Encrypted, Intercepted)');
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("Step 20 (Attack): Attacker decrypts, reads (and potentially modifies) the data.");
            // No visual for decryption, just text
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("Step 21 (Attack): Attacker re-encrypts and forwards data to Client.");
            await addMessage('Attacker', 'Client', 'Application Data (Re-encrypted)');
            await waitForResume();
            await delay(stepDelay);

            await waitForResume();
            updateExplanation("End of MitM Simulation. Attacker controls the communication.");

         } catch (error) {
            console.error("Simulation error:", error);
            explanationText.textContent = "An error occurred during the simulation.";
            throw error; // Re-throw error to be caught by runSimulation
        } finally {
             // Remove button state logic from here
            // simulationRunning = false;
            // isPaused = false;
            // startButton.disabled = false;
            // toggleAttackButton.disabled = false;
            // pauseButton.classList.add('hidden');
            // resumeButton.classList.add('hidden');
            // replayButton.disabled = false; 
            // clearButton.disabled = false;
        }
    }

    // Async function to handle message display with animation
    async function addMessage(from, to, content) {
        const fromNode = document.getElementById(from.toLowerCase());
        const toNode = document.getElementById(to.toLowerCase());
        const messagesContainer = document.getElementById('messages'); // Container for positioning

        if (!fromNode || !toNode) {
            console.error(`Node not found for message: ${from} -> ${to}`);
            // Fallback to just adding text if nodes aren't found
            logMessage(from, to, content);
            return;
        }

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

        // Add the text message to the log area
        logMessage(from, to, content);
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

    // Separate function just for adding text to the log
    function logMessage(from, to, content) {
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
        if (content.includes('Certificate (Server\'s REAL Cert)')) messageKey = 'Certificate (Server\'s REAL Cert)';
        if (content.includes('Certificate (Attacker\'s FAKE Cert)')) messageKey = 'Certificate (Attacker\'s FAKE Cert)';
        if (content.includes('ClientKeyExchange (Encrypted with FAKE key)')) messageKey = 'ClientKeyExchange (Encrypted with FAKE key)';
        if (content.includes('ClientKeyExchange (Encrypted with REAL key)')) messageKey = 'ClientKeyExchange (Encrypted with REAL key)';

        // Simplified "Raw" data placeholder
        const rawData = generateRawData(messageKey);

        // Add specific class based on sender
        if (from.toLowerCase() === 'client') {
            messageElement.classList.add('client-msg');
        } else if (from.toLowerCase() === 'server') {
            messageElement.classList.add('server-msg');
        } else if (from.toLowerCase() === 'attacker') {
            messageElement.classList.add('attacker-msg');
        }

        // Set content based on raw view toggle
        if (messageKey.includes('Certificate')) {
            let certType = 'normal-server'; // Default for secure handshake
            if (messageKey === "Certificate (Server's REAL Cert)") {
                certType = 'real-server-mitm';
            } else if (messageKey === "Certificate (Attacker's FAKE Cert)") {
                certType = 'fake-attacker';
            } // If just 'Certificate', it remains 'normal-server'

            messageElement.classList.add('clickable-certificate');
            messageElement.style.cursor = 'pointer';
            messageElement.dataset.certType = certType; // Store type

            // Let's adjust how we add the text to be more robust
            const strongPart = document.createElement('strong');
            strongPart.textContent = `[${from} -> ${to}]: ${content}`;
            const smallPart = document.createElement('small');
            smallPart.style.fontStyle = 'italic';
            smallPart.style.marginLeft = '5px'; // Add some space
            smallPart.textContent = '(Click for details)';
            
            // Clear existing content before adding new structure
            messageElement.innerHTML = ''; 
            messageElement.appendChild(strongPart);
            messageElement.appendChild(smallPart);

        } else {
             // For non-certificate messages, just set the main text
             messageElement.innerHTML = `<strong>[${from} -> ${to}]: ${content}</strong>`;
        }

        // Add raw data if needed (append to existing innerHTML)
        if (showRaw && rawData) {
            // Need to check if innerHTML was already set
            if (messageElement.innerHTML) {
                 messageElement.innerHTML += `<br><pre class="raw-data">${rawData}</pre>`;
            } else {
                 // Fallback if somehow innerHTML is empty (shouldn't happen often)
                 messageElement.innerHTML = `<pre class="raw-data">${rawData}</pre>`;
            }
        }
       
        messagesDiv.appendChild(messageElement);

        // Scroll to the bottom
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // Add tooltip event listeners if content is available
        if (tooltipContent[messageKey]) {
            messageElement.classList.add('has-tooltip');
            // Attach to the main element, not just text content if using innerHTML
            messageElement.addEventListener('mouseover', (e) => showTooltip(e, messageKey));
            messageElement.addEventListener('mousemove', moveTooltip);
            messageElement.addEventListener('mouseout', hideTooltip);
        }

        // Make certificate messages clickable
        if (messageKey.includes('Certificate')) {
            let certType = 'normal-server'; // Default for secure handshake
            if (messageKey === "Certificate (Server's REAL Cert)") {
                certType = 'real-server-mitm';
            } else if (messageKey === "Certificate (Attacker's FAKE Cert)") {
                certType = 'fake-attacker';
            } // If just 'Certificate', it remains 'normal-server'

            messageElement.classList.add('clickable-certificate');
            messageElement.style.cursor = 'pointer';
            messageElement.dataset.certType = certType; // Store type
        }
    }

    // Helper to generate placeholder raw data
    function generateRawData(messageKey) {
        switch(messageKey) {
            case 'ClientHello':
            case 'ClientHello (Intercepted)':
                return `Record Type: Handshake (22)\n  Version: TLS 1.2 (0x0303)\n  Handshake Type: Client Hello (1)\n    Random: [32 bytes]\n    Cipher Suites Length: 8\n    Cipher Suites (4 suites):\n      Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (0xc02f)\n      Cipher Suite: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (0xc030)\n      Cipher Suite: TLS_RSA_WITH_AES_128_GCM_SHA256 (0x009c)\n      Cipher Suite: TLS_RSA_WITH_AES_256_GCM_SHA384 (0x009d)\n    Extensions (example):\n      Extension: server_name (SNI), Length: 18, Name: SecureServer.com\n      Extension: application_layer_protocol_negotiation (ALPN), Length: 8, Prot: http/1.1`;
            case 'ServerHello':
                return `Record Type: Handshake (22)\n  Version: TLS 1.2 (0x0303)\n  Handshake Type: Server Hello (2)\n    Random: [32 bytes]\n    Session ID Length: 32\n    Session ID: [32 bytes]\n    Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (0xc02f)\n    Extensions (example):\n      Extension: application_layer_protocol_negotiation (ALPN), Length: 8, Prot: http/1.1`;
            case 'Certificate':
            case "Certificate (Server's REAL Cert)":
            case "Certificate (Attacker's FAKE Cert)":
                 let issuer = messageKey.includes("FAKE") ? "Untrusted Self-Signed CA" : "Trusted Root CA";
                 let subject = "CN=SecureServer.com";
                 return `Record Type: Handshake (22)\n  Version: TLS 1.2 (0x0303)\n  Handshake Type: Certificate (11)\n    Certificates Length: [Total Length]\n    Certificate Chain Length: [Chain Length]\n      Certificate Length: [Cert 1 Length]\n        Subject: ${subject}\n        Issuer: ${issuer}\n        Serial Number: [Example Serial]\n        Validity: Not Before: Jan 1 2023, Not After: Jan 1 2025\n        Public Key: RSA (2048 bit)\n      Certificate Length: [Cert 2 Length (if any)]\n        Subject: ${issuer}\n        Issuer: [Higher Level CA or Self]`;
            case 'ServerKeyExchange / ServerHelloDone':
                 return `Record Type: Handshake (22)\n  Version: TLS 1.2 (0x0303)\n  Handshake Type: Server Key Exchange (12)\n    EC Diffie-Hellman Server Params:\n      Curve Type: named_curve (3)\n      Named Curve: secp256r1 (0x0017)\n      Pubkey: [65 bytes Uncompressed Point]\n      Signature Algorithm: rsa_pkcs1_sha256 (0x0401)\n      Signature: [Encrypted Hash of Params]\n-- THEN --\nRecord Type: Handshake (22)\n  Version: TLS 1.2 (0x0303)\n  Handshake Type: Server Hello Done (14)`;
            case 'ClientKeyExchange':
            case "ClientKeyExchange (Encrypted with FAKE key)":
            case "ClientKeyExchange (Encrypted with REAL key)":
                return `Record Type: Handshake (22)\n  Version: TLS 1.2 (0x0303)\n  Handshake Type: Client Key Exchange (16)\n    Encrypted PreMaster Secret: [Length (e.g., 256 bytes for RSA)]`;
            case 'ChangeCipherSpec':
                return `Record Type: Change Cipher Spec (20)\n  Version: TLS 1.2 (0x0303)\n  Message: [1]`;
            case 'Finished (Encrypted)':
                return `Record Type: Handshake (22) - Encrypted Handshake Message\n  Version: TLS 1.2 (0x0303)\n    Handshake Type: Finished (20)\n    Verify Data: [12 bytes for TLS 1.2]`;
            case 'Application Data (Encrypted)':
            case 'Application Data (Encrypted, Intercepted)':
            case 'Application Data (Re-encrypted)':
                 return `Record Type: Application Data (23)\n  Version: TLS 1.2 (0x0303)\n  Encrypted Application Data: [Variable Length + Auth Tag (GCM)]`;
            default:
                return null; // No raw data for other types
        }
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
        modalBody.innerHTML = `
            <p><strong>Issued To:</strong> ${data.issuedTo}</p>
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
});