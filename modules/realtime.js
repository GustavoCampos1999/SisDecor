import { _supabase } from '../supabaseClient.js';
import { carregarClientes } from './crm.js';
import { loadPermissions } from './permissions.js';
import { showToast } from './ui.js';

let realtimeChannel = null;

export async function initRealtime() {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    const { data: perfil } = await _supabase
        .from('perfis')
        .select('loja_id')
        .eq('user_id', user.id)
        .single();

    if (!perfil || !perfil.loja_id) return;

    const lojaId = perfil.loja_id;
    console.log("Iniciando Realtime para Loja:", lojaId);

    if (realtimeChannel) _supabase.removeChannel(realtimeChannel);

    realtimeChannel = _supabase.channel('mudancas-sistema')
        
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'clientes', filter: `loja_id=eq.${lojaId}` },
            (payload) => {
                console.log('Mudança em Clientes:', payload);
                carregarClientes(); 
            }
        )

        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'perfis', filter: `user_id=eq.${user.id}` },
            async (payload) => {
                console.log('Minhas permissões mudaram:', payload);
                showToast('Suas permissões foram alteradas.', 'warning');
                await loadPermissions(); 
            }
        )

        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'loja_roles', filter: `loja_id=eq.${lojaId}` },
            async (payload) => {
                console.log('Definição de cargos mudou:', payload);
                await loadPermissions();
            }
        );
    const tabelasDados = ['tecidos', 'confeccao', 'trilho', 'frete', 'instalacao'];

    tabelasDados.forEach(tabela => {
        realtimeChannel.on(
            'postgres_changes',
            { 
                event: '*', 
                schema: 'public', 
                table: tabela, 
                filter: `loja_id=eq.${lojaId}` 
            },
            (payload) => {
                console.log(`Mudança detectada em ${tabela}:`, payload);
                document.dispatchEvent(new CustomEvent('dadosBaseAlterados'));
            }
        );
    });

    realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Conectado ao Realtime (Completo)!');
        }
    });
}