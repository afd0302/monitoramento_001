document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('popup');
    const btnCadastrar = document.getElementById('btn-cadastrar');
    const btnCancelar = document.getElementById('btn-cancelar');
    const formCadastro = document.getElementById('form-cadastro');
    const listaLinks = document.getElementById('lista-links');
    const offlineAlert = document.getElementById('offline-alert');
    const offlineMessage = document.getElementById('offline-message');

    // Inicializar o mapa do Brasil
    let map = L.map('map').setView([-15.788497, -47.879873], 4); // Coordenadas do Brasil
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    let markers = {}; // Armazenar os marcadores no mapa

    // Mostrar popup de cadastro
    btnCadastrar.addEventListener('click', () => {
        popup.classList.remove('hidden');
    });

    // Fechar popup
    btnCancelar.addEventListener('click', () => {
        popup.classList.add('hidden');
        limparFormulario();
    });

    // Cadastrar ou editar link
    formCadastro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(formCadastro);
        const data = {
            unidade: formData.get('unidade'),
            empresa: formData.get('empresa'),
            ip: formData.get('ip'),
            latitude: parseFloat(formData.get('latitude')), // Converter para número
            longitude: parseFloat(formData.get('longitude')) // Converter para número
        };

        const editIdInput = document.getElementById('edit-id');
        if (editIdInput) {
            // Modo de edição: enviar PUT para atualizar o link
            const link_id = editIdInput.value;
            await fetch(`/atualizar/${link_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            // Remover o campo oculto após a edição
            editIdInput.remove();
        } else {
            // Modo de cadastro: enviar POST para cadastrar um novo link
            await fetch('/cadastrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        popup.classList.add('hidden');
        limparFormulario();
        loadLinks();
    });

    // Carregar links
    async function loadLinks() {
        try {
            const response = await fetch('/listar');
            const links = await response.json();

            // Ordenar os links por unidade (ordem alfabética)
            links.sort((a, b) => a.unidade.localeCompare(b.unidade));

            listaLinks.innerHTML = '';
            const offlineLinks = [];

            links.forEach((link) => {
                const div = document.createElement('div');
                div.className = 'link-item';
                div.innerHTML = `
                    <span>${link.unidade} (${link.ip}) - ${link.status === 'online' ? '<span style="color: green;">Online</span>' : '<span style="color: red;">Offline</span>'}</span>
                    <button onclick="editarLink(${link.id})">Editar</button>
                    <button onclick="excluirLink(${link.id})">Excluir</button>
                `;
                listaLinks.appendChild(div);

                // Atualizar ou criar o marcador
                updateMarker(link);

                // Verificar se o link está offline
                if (link.status === 'offline') {
                    offlineLinks.push(link.unidade);
                }
            });

            // Atualizar o alerta de links offline
            if (offlineLinks.length > 0) {
                offlineMessage.textContent = `Links Offline: ${offlineLinks.join(', ')}`;
                offlineAlert.style.display = 'block'; // Exibir o alerta
            } else {
                offlineAlert.style.display = 'none'; // Ocultar o alerta
            }
        } catch (error) {
            console.error('Erro ao carregar links:', error);
        }
    }

    // Excluir link
    window.excluirLink = async (link_id) => {
        try {
            // Enviar requisição DELETE para o backend
            await fetch(`/excluir/${link_id}`, { method: 'DELETE' });

            // Remover o marcador do mapa
            if (markers[link_id]) {
                map.removeLayer(markers[link_id]); // Remove o marcador do mapa
                delete markers[link_id];          // Remove o marcador do objeto `markers`
            }

            // Recarregar a lista de links
            loadLinks();
        } catch (error) {
            console.error('Erro ao excluir o link:', error);
        }
    };

    // Editar link
    window.editarLink = async (link_id) => {
        const response = await fetch('/listar');
        const links = await response.json();
        const link = links.find(l => l.id === link_id);

        // Preencher o formulário com os dados do link
        document.getElementById('unidade').value = link.unidade;
        document.getElementById('empresa').value = link.empresa;
        document.getElementById('ip').value = link.ip;
        document.getElementById('latitude').value = link.latitude;
        document.getElementById('longitude').value = link.longitude;

        // Adicionar um campo oculto para armazenar o ID do link
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'edit-id';
        hiddenInput.value = link_id;
        formCadastro.appendChild(hiddenInput);

        // Mostrar o popup
        popup.classList.remove('hidden');
    };

    // Limpar o formulário
    function limparFormulario() {
        formCadastro.reset();
        const editIdInput = document.getElementById('edit-id');
        if (editIdInput) {
            editIdInput.remove();
        }
    }

    // Função para criar ou atualizar um marcador
    function updateMarker(link) {
        if (markers[link.id]) {
            // Se o marcador já existe, atualize sua posição e ícone
            markers[link.id].setLatLng([link.latitude, link.longitude]);
            markers[link.id].setIcon(L.icon({
                iconUrl: link.status === 'online' ? 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' :
                         'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            }));
        } else {
            // Se o marcador não existe, crie-o
            markers[link.id] = L.marker([link.latitude, link.longitude]).addTo(map);
            markers[link.id].bindPopup(`${link.unidade}<br>${link.ip}`);
            markers[link.id].setIcon(L.icon({
                iconUrl: link.status === 'online' ? 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' :
                         'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            }));
        }

        // Priorizar marcadores offline (usando ícones diferentes)
        if (link.status === 'offline') {
            markers[link.id].setIcon(L.icon({
                iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                iconSize: [30, 51], // Ícone maior para destacar
                iconAnchor: [15, 51]
            }));
        }
    }

    // Atualizar links a cada 5 segundos
    setInterval(loadLinks, 5000);

    // Carregar links inicialmente
    loadLinks();
});