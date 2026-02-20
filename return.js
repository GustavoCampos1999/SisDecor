const BACKEND_API_URL = 'https://painel-de-controle-gcv.onrender.com';

async function checkStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (!sessionId) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${BACKEND_API_URL}/api/pagamentos/status?session_id=${sessionId}`);
        const session = await response.json();

        document.getElementById('status-checking').classList.add('hidden');

        if (session.status === 'complete') {
            document.getElementById('status-success').classList.remove('hidden');
            document.getElementById('customer-email').textContent = session.customer_email;
        } else {
            document.getElementById('status-error').classList.remove('hidden');
            document.getElementById('error-message').textContent = "O pagamento ainda não foi processado ou foi cancelado.";
        }
    } catch (error) {
        console.error("Erro ao verificar status:", error);
        document.getElementById('status-checking').classList.add('hidden');
        document.getElementById('status-error').classList.remove('hidden');
    }
}

checkStatus();