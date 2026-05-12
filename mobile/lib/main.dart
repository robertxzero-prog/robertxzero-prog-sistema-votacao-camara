import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'services/api_client.dart';
import 'services/realtime_service.dart';

void main() {
  runApp(const CamaraVotacaoApp());
}

class CamaraVotacaoApp extends StatelessWidget {
  const CamaraVotacaoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Votacao Camara',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1455D9)),
        useMaterial3: true,
      ),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final _api = ApiClient();
  bool _loading = true;
  Map<String, dynamic>? _usuario;

  @override
  void initState() {
    super.initState();
    _loadSession();
  }

  Future<void> _loadSession() async {
    final token = await _api.getToken();
    if (token == null) {
      setState(() => _loading = false);
      return;
    }

    try {
      final usuario = await _api.me();
      setState(() {
        _usuario = usuario;
        _loading = false;
      });
    } catch (_) {
      await _api.clearToken();
      setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    await _api.clearToken();
    setState(() => _usuario = null);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_usuario == null) {
      return LoginPage(
        api: _api,
        onLogin: (usuario) => setState(() => _usuario = usuario),
      );
    }

    final role = _usuario?['role']?.toString().toUpperCase() ?? '';
    if (role == 'PRESIDENTE' || role == 'ADMIN') {
      return PresidentPage(api: _api, usuario: _usuario!, onLogout: _logout);
    }

    return VotingPage(api: _api, usuario: _usuario!, onLogout: _logout);
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    required this.api,
    required this.onLogin,
    super.key,
  });

  final ApiClient api;
  final void Function(Map<String, dynamic> usuario) onLogin;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class PresidentPage extends StatefulWidget {
  const PresidentPage({
    required this.api,
    required this.usuario,
    required this.onLogout,
    super.key,
  });

  final ApiClient api;
  final Map<String, dynamic> usuario;
  final Future<void> Function() onLogout;

  @override
  State<PresidentPage> createState() => _PresidentPageState();
}

class _PresidentPageState extends State<PresidentPage> {
  final _realtime = RealtimeService();
  final _imagePicker = ImagePicker();
  bool _loading = true;
  bool _sending = false;
  bool _connected = false;
  String? _error;
  Map<String, dynamic>? _votacaoAtiva;
  Map<String, dynamic>? _usuarioAtual;
  List<Map<String, dynamic>> _pautas = [];
  Map<String, dynamic>? _quorum;
  bool _presenceConfirmed = false;
  String? _avatarLocalBase64;

  @override
  void initState() {
    super.initState();
    _usuarioAtual = widget.usuario;
    _realtime.connect(
      onConnectionChanged: (connected) {
        if (!mounted) return;
        setState(() => _connected = connected);
      },
      onVotacaoAtualizada: (_) => _loadData(),
      onVotacaoEncerrada: (_) => _loadData(),
      onVotoRegistrado: (_) => _loadData(),
      onPresencaAtualizada: (_) => _loadData(),
    );
    _loadAvatarLocal();
    _loadData();
  }

  @override
  void dispose() {
    _realtime.disconnect();
    super.dispose();
  }

  Future<void> _loadData() async {
    try {
      setState(() {
        _loading = true;
        _error = null;
      });
      final usuario = await widget.api.me();
      final votacao = await widget.api.votacaoAtiva();
      final pautas = await widget.api.pautas();
      Map<String, dynamic>? quorum;
      var presenceConfirmed = false;
      final sessaoId = votacao?['pautas']?['sessao_id']?.toString();
      final vereadorId = usuario['vereador']?['id']?.toString();
      if (sessaoId != null) {
        quorum = await widget.api.quorum(sessaoId);
        if (vereadorId != null) {
          final presencas = await widget.api.presencas(sessaoId);
          presenceConfirmed = presencas.any(
            (item) => item['vereador_id']?.toString() == vereadorId,
          );
        }
      }

      if (!mounted) return;
      setState(() {
        _usuarioAtual = usuario;
        _votacaoAtiva = votacao;
        _pautas = pautas;
        _quorum = quorum;
        _presenceConfirmed = presenceConfirmed;
      });
      await _loadAvatarLocal();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _abrirVotacao(String pautaId) async {
    try {
      setState(() => _sending = true);
      await widget.api.abrirVotacao(pautaId);
      await _loadData();
    } catch (error) {
      _showSnack(error.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _encerrarVotacao() async {
    final id = _votacaoAtiva?['id']?.toString();
    if (id == null) return;
    try {
      setState(() => _sending = true);
      await widget.api.encerrarVotacao(id);
      await _loadData();
    } catch (error) {
      _showSnack(error.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  bool get _presidenteEhVereador =>
      _usuarioAtual?['vereador'] is Map<String, dynamic>;

  bool get _presidenteJaVotou {
    final vereadorId = _usuarioAtual?['vereador']?['id']?.toString();
    final votos = (_votacaoAtiva?['votos'] as List?) ?? [];
    return votos.any((item) => item['vereador_id']?.toString() == vereadorId);
  }

  String? get _votoPresidente {
    final vereadorId = _usuarioAtual?['vereador']?['id']?.toString();
    final votos = (_votacaoAtiva?['votos'] as List?) ?? [];
    for (final item in votos) {
      if (item['vereador_id']?.toString() == vereadorId) {
        return item['voto']?.toString();
      }
    }
    return null;
  }

  Future<void> _confirmarPresenca() async {
    final sessaoId = _votacaoAtiva?['pautas']?['sessao_id']?.toString();
    if (sessaoId == null) return;
    try {
      setState(() => _sending = true);
      await widget.api.confirmarPresenca(sessaoId);
      await _loadData();
    } catch (error) {
      _showSnack(error.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _votar(String voto) async {
    final votacaoId = _votacaoAtiva?['id']?.toString();
    if (votacaoId == null) return;
    if (!_presenceConfirmed) {
      _showSnack('Confirme sua presenca antes de votar.');
      return;
    }
    if (_quorum?['quorum_atingido'] != true) {
      _showSnack('Quorum minimo ainda nao foi atingido.');
      return;
    }
    if (_presidenteJaVotou) {
      _showSnack('Voce ja votou nesta votacao.');
      return;
    }
    try {
      setState(() => _sending = true);
      await widget.api.votar(votacaoId, voto);
      await _loadData();
    } catch (error) {
      _showSnack(error.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String? _avatarStorageKey() {
    final id = _usuarioAtual?['id']?.toString();
    if (id == null || id.isEmpty) return null;
    return 'avatar_local_$id';
  }

  Future<void> _loadAvatarLocal() async {
    final key = _avatarStorageKey();
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    final foto = prefs.getString(key);
    if (!mounted) return;
    setState(() {
      _avatarLocalBase64 = foto;
    });
  }

  Future<void> _pickAvatarFromGallery() async {
    final picked = await _imagePicker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
      maxWidth: 1024,
      maxHeight: 1024,
    );
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    final base64Value = base64Encode(bytes);
    final key = _avatarStorageKey();
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, base64Value);
    if (!mounted) return;
    setState(() {
      _avatarLocalBase64 = base64Value;
    });
  }

  Future<void> _removeAvatarLocal() async {
    final key = _avatarStorageKey();
    if (key == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(key);
    if (!mounted) return;
    setState(() {
      _avatarLocalBase64 = null;
    });
  }

  Future<void> _showAvatarActions() async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.add_a_photo),
                title: const Text('Adicionar foto'),
                onTap: () async {
                  Navigator.of(context).pop();
                  await _pickAvatarFromGallery();
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Remover foto'),
                onTap: () async {
                  Navigator.of(context).pop();
                  await _removeAvatarLocal();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _configurar2fa() async {
    try {
      final setup = await widget.api.setup2fa();
      final secret = setup['secret']?.toString() ?? '';
      if (!mounted) return;
      final controller = TextEditingController();
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: const Text('Configurar 2FA'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Cadastre esta chave no app autenticador:'),
                const SizedBox(height: 8),
                SelectableText(
                  secret,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Código de 6 dígitos',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Cancelar'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Ativar'),
              ),
            ],
          );
        },
      );
      if (confirmed != true) return;
      await widget.api.confirmar2fa(controller.text.trim());
      await _loadData();
      _showSnack('2FA ativado com sucesso.');
    } catch (error) {
      _showSnack(error.toString());
    }
  }

  Future<void> _desativar2fa() async {
    try {
      await widget.api.desativar2fa();
      await _loadData();
      _showSnack('2FA desativado.');
    } catch (error) {
      _showSnack(error.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final nome = _usuarioAtual?['nome']?.toString() ?? 'Presidente';
    final fotoUrl = _usuarioAtual?['foto_url']?.toString();
    final hasLocalPhoto = _avatarLocalBase64 != null && _avatarLocalBase64!.isNotEmpty;
    final hasRemotePhoto = fotoUrl != null && fotoUrl.isNotEmpty;
    final initial = nome.isNotEmpty ? nome[0].toUpperCase() : 'P';
    ImageProvider? avatarProvider;
    if (hasLocalPhoto) {
      avatarProvider = MemoryImage(base64Decode(_avatarLocalBase64!));
    } else if (hasRemotePhoto) {
      avatarProvider = NetworkImage(fotoUrl);
    }
    final temVotacaoAtiva = _votacaoAtiva != null && _votacaoAtiva!['id'] != null;
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        title: Text('Painel Presidente - $nome'),
        actions: [
          GestureDetector(
            onTap: _showAvatarActions,
            child: Padding(
              padding: const EdgeInsets.only(right: 8),
              child: CircleAvatar(
                radius: 16,
                backgroundImage: avatarProvider,
                child: avatarProvider == null
                    ? Text(
                        initial,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      )
                    : null,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(child: Text(_connected ? 'Online' : 'Reconectando')),
          ),
          IconButton(onPressed: _loadData, icon: const Icon(Icons.refresh)),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'setup_2fa') {
                _configurar2fa();
              } else if (value == 'disable_2fa') {
                _desativar2fa();
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: 'setup_2fa',
                child: Text('Configurar 2FA'),
              ),
              PopupMenuItem(
                value: 'disable_2fa',
                child: Text('Desativar 2FA'),
              ),
            ],
          ),
          IconButton(onPressed: widget.onLogout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Card(
                      color: Colors.red.shade100,
                      child: ListTile(
                        title: const Text('Erro'),
                        subtitle: Text(_error!),
                      ),
                    ),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            temVotacaoAtiva ? 'Votacao em andamento' : 'Nenhuma votacao aberta',
                            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            temVotacaoAtiva
                                ? (_votacaoAtiva?['pautas']?['titulo']?.toString() ?? 'Votacao ativa')
                                : 'Aguardando abertura',
                          ),
                          const SizedBox(height: 12),
                          if (_quorum != null)
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                _Badge(label: 'Presentes', value: '${_quorum!['presentes'] ?? 0}'),
                                _Badge(label: 'Quorum', value: _quorum!['quorum_atingido'] == true ? 'OK' : 'Insuficiente'),
                              ],
                            ),
                          const SizedBox(height: 12),
                          if (temVotacaoAtiva)
                            SizedBox(
                              height: 56,
                              child: FilledButton(
                                onPressed: _sending ? null : _encerrarVotacao,
                                child: const Text('Encerrar votacao'),
                              ),
                            ),
                          if (temVotacaoAtiva && _presidenteEhVereador) ...[
                            const SizedBox(height: 14),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF8FAFC),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: const Color(0xFFE2E8F0)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  const Text(
                                    'Voto do presidente',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  SizedBox(
                                    height: 60,
                                    child: FilledButton.icon(
                                      onPressed:
                                          _presenceConfirmed || _sending ? null : _confirmarPresenca,
                                      icon: Icon(
                                        _presenceConfirmed ? Icons.check_circle : Icons.person_add,
                                      ),
                                      style: FilledButton.styleFrom(
                                        backgroundColor: _presenceConfirmed
                                            ? Colors.green.shade700
                                            : Colors.blue.shade700,
                                        textStyle: const TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      label: Text(
                                        _presenceConfirmed
                                            ? 'Presenca confirmada'
                                            : 'Confirmar presenca',
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  if (_presidenteJaVotou)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 10,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.green.shade50,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        'Seu voto: ${_votoPresidente ?? '-'}',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w900,
                                          color: Colors.green.shade800,
                                        ),
                                      ),
                                    )
                                  else
                                    SizedBox(
                                      height: 68,
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: FilledButton(
                                              onPressed: _sending ? null : () => _votar('SIM'),
                                              style: FilledButton.styleFrom(
                                                backgroundColor: Colors.green.shade700,
                                                textStyle: const TextStyle(
                                                  fontSize: 22,
                                                  fontWeight: FontWeight.w900,
                                                ),
                                              ),
                                              child: const Text('SIM'),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: FilledButton(
                                              onPressed: _sending ? null : () => _votar('NAO'),
                                              style: FilledButton.styleFrom(
                                                backgroundColor: Colors.red.shade700,
                                                textStyle: const TextStyle(
                                                  fontSize: 22,
                                                  fontWeight: FontWeight.w900,
                                                ),
                                              ),
                                              child: const Text('NAO'),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: FilledButton(
                                              onPressed:
                                                  _sending ? null : () => _votar('ABSTENCAO'),
                                              style: FilledButton.styleFrom(
                                                backgroundColor: Colors.amber.shade700,
                                                textStyle: const TextStyle(
                                                  fontSize: 22,
                                                  fontWeight: FontWeight.w900,
                                                ),
                                              ),
                                              child: const Text('ABSTER'),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Pautas',
                            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 8),
                          ..._pautas.map((pauta) {
                            final id = pauta['id']?.toString() ?? '';
                            final titulo = pauta['titulo']?.toString() ?? 'Sem titulo';
                            final temAberta =
                                (pauta['votacoes'] as List?)?.any((v) => v['status'] == 'ABERTA') == true;
                            return ListTile(
                              title: Text(titulo),
                              subtitle: Text('Ordem ${pauta['numero_ordem'] ?? '-'}'),
                              trailing: FilledButton(
                                onPressed: _sending || temVotacaoAtiva || temAberta || id.isEmpty
                                    ? null
                                    : () => _abrirVotacao(id),
                                child: const Text('Iniciar votacao'),
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _LoginPageState extends State<LoginPage> {
  final _emailController = TextEditingController();
  final _senhaController = TextEditingController();
  final _twoFactorController = TextEditingController();
  bool _loading = false;
  bool _requires2fa = false;
  String? _error;

  Future<void> _login() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await widget.api.login(
        _emailController.text.trim(),
        _senhaController.text,
        twoFactorCode:
            _requires2fa ? _twoFactorController.text.trim() : null,
        deviceName: 'Flutter Tablet',
      );
      if (data['requires_2fa'] == true) {
        setState(() {
          _requires2fa = true;
          _error = 'Informe o código 2FA para continuar.';
        });
        return;
      }
      widget.onLogin(data['usuario'] as Map<String, dynamic>);
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Votacao Camara',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  const SizedBox(height: 8),
                  const Text('Entre com o usuario do vereador.'),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _senhaController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Senha',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _login(),
                  ),
                  if (_requires2fa) ...[
                    const SizedBox(height: 14),
                    TextField(
                      controller: _twoFactorController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Código 2FA (6 dígitos)',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _login(),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Text(
                      _error!,
                      style: const TextStyle(
                        color: Colors.red,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  FilledButton(
                    onPressed: _loading ? null : _login,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(_loading ? 'Entrando...' : 'Entrar'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class VotingPage extends StatefulWidget {
  const VotingPage({
    required this.api,
    required this.usuario,
    required this.onLogout,
    super.key,
  });

  final ApiClient api;
  final Map<String, dynamic> usuario;
  final Future<void> Function() onLogout;

  @override
  State<VotingPage> createState() => _VotingPageState();
}

class _VotingPageState extends State<VotingPage> {
  final _realtime = RealtimeService();
  final _imagePicker = ImagePicker();

  Map<String, dynamic>? _usuario;
  Map<String, dynamic>? _votacao;
  Map<String, dynamic>? _quorum;
  List<Map<String, dynamic>> _historico = [];
  List<Map<String, dynamic>> _sessoesRelatorio = [];
  Map<String, dynamic>? _ataSelecionada;
  Map<String, dynamic>? _sessaoDetalhe;
  String? _ataSelecionadaId;
  String? _sessaoDetalheId;

  bool _loading = true;
  bool _sending = false;
  bool _presenceConfirmed = false;
  bool _connected = false;
  bool _loadingAta = false;
  bool _loadingSessaoDetalhe = false;
  String? _error;
  String _message = 'Aguardando votacao...';
  Timer? _pendingSyncTimer;
  int _pendingActionsCount = 0;
  bool _syncingPending = false;
  int _tabIndex = 0;
  String _historicoBusca = '';
  String _historicoPeriodo = 'todos';
  String _historicoOrdenacao = 'recentes';
  int _historicoPagina = 1;
  static const int _historicoPageSize = 8;
  String? _avatarLocalBase64;
  String? _avatarCacheUserKey;

  @override
  void initState() {
    super.initState();
    _usuario = widget.usuario;
    _connectRealtime();
    _loadAvatarLocal();
    _refreshPendingActionsCount();
    _loadAllData();
    _pendingSyncTimer = Timer.periodic(
      const Duration(seconds: 12),
      (_) => _flushPendingActions(),
    );
  }

  @override
  void dispose() {
    _pendingSyncTimer?.cancel();
    _realtime.disconnect();
    super.dispose();
  }

  void _connectRealtime() {
    _realtime.connect(
      onConnectionChanged: (connected) {
        if (!mounted) return;
        setState(() => _connected = connected);
        if (connected) {
          _loadAllData(message: 'Conexao restabelecida');
          _flushPendingActions();
        }
      },
      onVotacaoAtualizada: (_) => _loadAllData(message: 'Votacao atualizada'),
      onVotacaoEncerrada: (_) => _loadAllData(message: 'Votacao encerrada'),
      onVotoRegistrado: (_) => _loadAllData(message: 'Novo voto registrado'),
      onPresencaAtualizada: (_) => _loadAllData(message: 'Presenca atualizada'),
    );
  }

  Future<void> _loadAllData({String? message}) async {
    try {
      setState(() {
        _loading = true;
        _error = null;
      });

      final usuario = await widget.api.me();
      final votacao = await widget.api.votacaoAtiva();
      final historico = await widget.api.votacoesEncerradas();
      final sessoesRelatorio = await widget.api.relatorioSessoes();

      Map<String, dynamic>? quorum;
      var presenceConfirmed = false;
      final sessaoId = votacao?['pautas']?['sessao_id']?.toString();
      final vereadorId = usuario['vereador']?['id']?.toString();

      if (sessaoId != null) {
        quorum = await widget.api.quorum(sessaoId);
        if (vereadorId != null) {
          final presencas = await widget.api.presencas(sessaoId);
          presenceConfirmed = presencas.any(
            (item) => item['vereador_id']?.toString() == vereadorId,
          );
        }
      }

      if (!mounted) return;
      setState(() {
        _usuario = usuario;
        _votacao = votacao;
        _quorum = quorum;
        _presenceConfirmed = presenceConfirmed;
        _historico = historico;
        _sessoesRelatorio = sessoesRelatorio;
        _historicoPagina = 1;
        _message = message ??
            (votacao == null ? 'Aguardando votacao...' : 'Votacao aberta');
      });
      await _loadAvatarLocal();
    } catch (error) {
      if (_isUnauthorized(error)) {
        await _forceLogout('Sessao expirada. Entre novamente.');
        return;
      }
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  List<Map<String, dynamic>> get _historicoFiltrado {
    final now = DateTime.now();
    final filtrado = _historico.where((item) {
      final pauta = item['pautas'] as Map<String, dynamic>?;
      final sessao = pauta?['sessoes'] as Map<String, dynamic>?;
      final texto = [
        pauta?['titulo']?.toString() ?? '',
        sessao?['titulo']?.toString() ?? '',
        item['id']?.toString() ?? '',
      ].join(' ').toLowerCase();

      final buscaOk = _historicoBusca.trim().isEmpty ||
          texto.contains(_historicoBusca.trim().toLowerCase());

      final encerradaEm =
          DateTime.tryParse(item['encerrada_em']?.toString() ?? '');
      final periodoOk = switch (_historicoPeriodo) {
        'hoje' =>
          encerradaEm != null &&
              encerradaEm.year == now.year &&
              encerradaEm.month == now.month &&
              encerradaEm.day == now.day,
        '7dias' =>
          encerradaEm != null &&
              encerradaEm.isAfter(now.subtract(const Duration(days: 7))),
        _ => true,
      };

      return buscaOk && periodoOk;
    }).toList();

    filtrado.sort((a, b) {
      final aEnc = DateTime.tryParse(a['encerrada_em']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0);
      final bEnc = DateTime.tryParse(b['encerrada_em']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0);
      final aSessao =
          ((a['pautas'] as Map<String, dynamic>?)?['sessoes'] as Map<String, dynamic>?)?['titulo']
                  ?.toString() ??
              '';
      final bSessao =
          ((b['pautas'] as Map<String, dynamic>?)?['sessoes'] as Map<String, dynamic>?)?['titulo']
                  ?.toString() ??
              '';

      return switch (_historicoOrdenacao) {
        'antigas' => aEnc.compareTo(bEnc),
        'sessao' => aSessao.toLowerCase().compareTo(bSessao.toLowerCase()),
        _ => bEnc.compareTo(aEnc),
      };
    });

    return filtrado;
  }

  int get _historicoTotalPaginas {
    final total = _historicoFiltrado.length;
    if (total == 0) return 1;
    return (total / _historicoPageSize).ceil();
  }

  List<Map<String, dynamic>> get _historicoPaginado {
    final dados = _historicoFiltrado;
    final pagina = _historicoPagina.clamp(1, _historicoTotalPaginas);
    final inicio = (pagina - 1) * _historicoPageSize;
    if (inicio >= dados.length) return [];
    final fim = (inicio + _historicoPageSize).clamp(0, dados.length);
    return dados.sublist(inicio, fim);
  }

  bool get _hasVoted {
    final vereadorId = _usuario?['vereador']?['id']?.toString();
    final votos = (_votacao?['votos'] as List?) ?? [];
    return votos.any((item) => item['vereador_id']?.toString() == vereadorId);
  }

  String? get _registeredVote {
    final vereadorId = _usuario?['vereador']?['id']?.toString();
    final votos = (_votacao?['votos'] as List?) ?? [];
    for (final item in votos) {
      if (item['vereador_id']?.toString() == vereadorId) {
        return item['voto']?.toString();
      }
    }
    return null;
  }

  Future<void> _confirmPresence() async {
    final sessaoId = _votacao?['pautas']?['sessao_id']?.toString();
    if (sessaoId == null) {
      _showSnack('Nenhuma sessao ativa.');
      return;
    }

    await _runSending(() async {
      try {
        await widget.api.confirmarPresenca(sessaoId);
      } on ApiException catch (error) {
        if (error.statusCode == null || error.statusCode! >= 500) {
          await _enqueuePendingAction({
            'tipo': 'confirmar_presenca',
            'sessao_id': sessaoId,
          });
          _showSnack('Sem conexao. Presenca enfileirada para sincronizar.');
          return;
        }
        rethrow;
      }
      await _loadAllData(message: 'Presenca confirmada');
    });
  }

  Future<void> _vote(String vote) async {
    if (_votacao == null) {
      _showSnack('Nenhuma votacao aberta.');
      return;
    }
    if (!_presenceConfirmed) {
      _showSnack('Confirme sua presenca antes de votar.');
      return;
    }
    if (_quorum?['quorum_atingido'] != true) {
      _showSnack('Quorum minimo ainda nao foi atingido.');
      return;
    }
    if (_hasVoted) {
      _showSnack('Voce ja votou nesta votacao.');
      return;
    }

    final confirmou = await _confirmarVoto(vote);
    if (confirmou != true) {
      return;
    }

    await _runSending(() async {
      try {
        await widget.api.votar(_votacao!['id'].toString(), vote);
      } on ApiException catch (error) {
        if (error.statusCode == null || error.statusCode! >= 500) {
          await _enqueuePendingAction({
            'tipo': 'registrar_voto',
            'votacao_id': _votacao!['id'].toString(),
            'voto': vote,
          });
          _showSnack('Sem conexao. Voto enfileirado para sincronizar.');
          return;
        }
        rethrow;
      }
      await _loadAllData(message: 'Voto registrado com sucesso');
    });
  }

  Future<void> _enqueuePendingAction(Map<String, dynamic> action) async {
    final prefs = await SharedPreferences.getInstance();
    final lista = prefs.getStringList('pending_actions') ?? <String>[];
    lista.add(
      jsonEncode({
        ...action,
        'criado_em': DateTime.now().toIso8601String(),
      }),
    );
    await prefs.setStringList('pending_actions', lista);
    if (mounted) {
      setState(() => _pendingActionsCount = lista.length);
    }
  }

  Future<void> _refreshPendingActionsCount() async {
    final prefs = await SharedPreferences.getInstance();
    final lista = prefs.getStringList('pending_actions') ?? <String>[];
    if (!mounted) return;
    setState(() => _pendingActionsCount = lista.length);
  }

  Future<void> _flushPendingActions() async {
    if (!_connected) return;
    final prefs = await SharedPreferences.getInstance();
    final lista = prefs.getStringList('pending_actions') ?? <String>[];
    if (lista.isEmpty) return;
    if (mounted) {
      setState(() => _syncingPending = true);
    }

    final restantes = <String>[];
    var sincronizadas = 0;

    for (final item in lista) {
      try {
        final acao = jsonDecode(item) as Map<String, dynamic>;
        final tipo = acao['tipo']?.toString();
        if (tipo == 'confirmar_presenca') {
          final sessaoId = acao['sessao_id']?.toString();
          if (sessaoId != null && sessaoId.isNotEmpty) {
            await widget.api.confirmarPresenca(sessaoId);
            sincronizadas++;
            continue;
          }
        }
        if (tipo == 'registrar_voto') {
          final votacaoId = acao['votacao_id']?.toString();
          final voto = acao['voto']?.toString();
          if (votacaoId != null &&
              votacaoId.isNotEmpty &&
              voto != null &&
              voto.isNotEmpty) {
            await widget.api.votar(votacaoId, voto);
            sincronizadas++;
            continue;
          }
        }
        restantes.add(item);
      } catch (_) {
        restantes.add(item);
      }
    }

    await prefs.setStringList('pending_actions', restantes);
    if (mounted) {
      setState(() {
        _pendingActionsCount = restantes.length;
        _syncingPending = false;
      });
    }
    if (sincronizadas > 0) {
      _showSnack('$sincronizadas acao(oes) offline sincronizada(s).');
      await _loadAllData(message: 'Sincronizacao concluida');
    }
  }

  Future<bool?> _confirmarVoto(String voto) {
    final votoExibicao = switch (voto) {
      'NAO' => 'NAO',
      'ABSTENCAO' => 'ABSTER',
      _ => voto,
    };

    return showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Confirmar voto'),
          content: Text('Deseja confirmar seu voto como "$votoExibicao"?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Confirmar'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _carregarAta(String votacaoId) async {
    try {
      setState(() {
        _loadingAta = true;
        _ataSelecionadaId = votacaoId;
      });
      final ata = await widget.api.ataVotacao(votacaoId);
      if (!mounted) return;
      setState(() {
        _ataSelecionada = ata;
        _tabIndex = 2;
      });
    } catch (error) {
      await _handleError(error);
    } finally {
      if (mounted) {
        setState(() => _loadingAta = false);
      }
    }
  }

  Future<void> _carregarSessaoDetalhe(String sessaoId) async {
    try {
      setState(() {
        _loadingSessaoDetalhe = true;
        _sessaoDetalheId = sessaoId;
      });
      final sessao = await widget.api.relatorioSessao(sessaoId);
      if (!mounted) return;
      setState(() {
        _sessaoDetalhe = sessao;
        _tabIndex = 3;
      });
    } catch (error) {
      await _handleError(error);
    } finally {
      if (mounted) {
        setState(() => _loadingSessaoDetalhe = false);
      }
    }
  }

  Future<void> _abrirPdfAta() async {
    final votacaoId = _ataSelecionada?['votacao_id']?.toString();
    if (votacaoId == null) {
      _showSnack('Nenhuma ata selecionada.');
      return;
    }
    final uri = Uri.parse(widget.api.ataPdfUrl(votacaoId));
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) {
      _showSnack('Nao foi possivel abrir o PDF.');
    }
  }

  Future<void> _runSending(Future<void> Function() action) async {
    try {
      setState(() => _sending = true);
      await action();
    } catch (error) {
      await _handleError(error);
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  String get _avatarUserKey {
    final id = _usuario?['id']?.toString();
    final email = _usuario?['email']?.toString();
    return id?.isNotEmpty == true
        ? 'avatar_local_$id'
        : 'avatar_local_${email ?? 'default'}';
  }

  Future<void> _loadAvatarLocal() async {
    final key = _avatarUserKey;
    if (_avatarCacheUserKey == key && _avatarLocalBase64 != null) return;
    final prefs = await SharedPreferences.getInstance();
    final value = prefs.getString(key);
    if (!mounted) return;
    setState(() {
      _avatarCacheUserKey = key;
      _avatarLocalBase64 = value;
    });
  }

  Future<void> _saveAvatarLocal(String base64Value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_avatarUserKey, base64Value);
    if (!mounted) return;
    setState(() => _avatarLocalBase64 = base64Value);
  }

  Future<void> _removeAvatarLocal() async {
    final userId = _usuario?['id']?.toString();
    if (userId == null || userId.isEmpty) {
      _showSnack('Usuario invalido para remover foto.');
      return;
    }

    try {
      await widget.api.removerMinhaFoto(userId);
    } catch (error) {
      if (!_isUnauthorized(error)) {
        _showSnack('Nao foi possivel remover no servidor, removendo localmente.');
      }
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_avatarUserKey);
    if (!mounted) return;
    setState(() => _avatarLocalBase64 = null);
    await _loadAllData(message: 'Foto removida.');
  }

  Future<void> _pickAvatarFromGallery() async {
    final file = await _imagePicker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 70,
      maxWidth: 1024,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    await _saveAvatarLocal(base64Encode(bytes));

    final userId = _usuario?['id']?.toString();
    if (userId != null && userId.isNotEmpty) {
      try {
        await widget.api.uploadMinhaFoto(userId, file.path);
        await _loadAllData(message: 'Foto atualizada.');
      } catch (error) {
        await _handleError(error);
        _showSnack('Foto mantida localmente neste dispositivo.');
      }
    } else {
      _showSnack('Foto salva localmente.');
    }
  }

  Future<void> _onAvatarTap() async {
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.add_a_photo),
                title: const Text('Adicionar foto'),
                onTap: () async {
                  Navigator.of(context).pop();
                  await _pickAvatarFromGallery();
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Remover foto'),
                onTap: () async {
                  Navigator.of(context).pop();
                  await _removeAvatarLocal();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  bool _isUnauthorized(Object error) {
    return error is ApiException && error.isUnauthorized;
  }

  Future<void> _handleError(Object error) async {
    if (_isUnauthorized(error)) {
      await _forceLogout('Sessao expirada. Entre novamente.');
      return;
    }
    _showSnack(error.toString());
  }

  Future<void> _forceLogout(String message) async {
    if (!mounted) return;
    _realtime.disconnect();
    _showSnack(message);
    await widget.onLogout();
  }

  @override
  Widget build(BuildContext context) {
    final userName = _usuario?['nome']?.toString() ?? 'Vereador';
    final role = _usuario?['role']?.toString().toUpperCase() ?? '';
    final vereador = _usuario?['vereador'] as Map<String, dynamic>?;
    final cadeira = vereador?['cadeira']?['numero']?.toString() ?? '-';
    final partido = vereador?['partido']?.toString() ?? '-';

    if (role == 'PRESIDENTE' || role == 'ADMIN') {
      return PresidentPage(
        api: widget.api,
        usuario: _usuario ?? widget.usuario,
        onLogout: widget.onLogout,
      );
    }

    if (role.isNotEmpty && role != 'VEREADOR') {
      return Scaffold(
        backgroundColor: const Color(0xFF020617),
        appBar: AppBar(
          backgroundColor: const Color(0xFF0F172A),
          foregroundColor: Colors.white,
          title: const Text('Acesso nao permitido'),
          actions: [
            IconButton(
              onPressed: widget.onLogout,
              icon: const Icon(Icons.logout),
              tooltip: 'Sair',
            ),
          ],
        ),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Card(
              child: Padding(
                padding: EdgeInsets.all(18),
                child: Text(
                  'Este aplicativo de votacao esta habilitado apenas para perfil de vereador.',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        title: Text(userName),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(42),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(
              spacing: 8,
              children: [
                _TopTab(
                  label: 'Votacao',
                  selected: _tabIndex == 0,
                  onTap: () => setState(() => _tabIndex = 0),
                ),
                _TopTab(
                  label: 'Historico',
                  selected: _tabIndex == 1,
                  onTap: () => setState(() => _tabIndex = 1),
                ),
                _TopTab(
                  label: 'Ata',
                  selected: _tabIndex == 2,
                  onTap: () => setState(() => _tabIndex = 2),
                ),
                _TopTab(
                  label: 'Relatorios',
                  selected: _tabIndex == 3,
                  onTap: () => setState(() => _tabIndex = 3),
                ),
              ],
            ),
          ),
        ),
        actions: [
          Row(
            children: [
              Icon(
                _connected ? Icons.wifi : Icons.wifi_off,
                color: _connected ? Colors.greenAccent : Colors.orangeAccent,
              ),
              const SizedBox(width: 6),
              Text(
                _syncingPending
                    ? 'Sincronizando'
                    : _connected
                        ? 'Online'
                        : 'Reconectando',
              ),
              if (_pendingActionsCount > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.amber),
                  ),
                  child: Text(
                    'Pendentes: $_pendingActionsCount',
                    style: const TextStyle(
                      color: Colors.amber,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
              const SizedBox(width: 12),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: _UserAvatar(
              nome: userName,
              fotoBase64: _avatarLocalBase64,
              fotoUrl: _usuario?['foto_url']?.toString() ??
                  _usuario?['avatar_url']?.toString(),
              onTap: _onAvatarTap,
            ),
          ),
          IconButton(
            onPressed: _loadAllData,
            icon: const Icon(Icons.refresh),
            tooltip: 'Atualizar',
          ),
          IconButton(
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
            tooltip: 'Sair',
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _loadAllData,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (_error != null)
                      Card(
                        color: Colors.red.shade100,
                        child: ListTile(
                          title: const Text('Falha ao carregar dados'),
                          subtitle: Text(_error!),
                          trailing: FilledButton(
                            onPressed: _loadAllData,
                            child: const Text('Tentar de novo'),
                          ),
                        ),
                      ),
                    if (_tabIndex == 0) ...[
                      _HeaderCard(
                        message: _message,
                        partido: partido,
                        cadeira: cadeira,
                      ),
                      const SizedBox(height: 12),
                      if (_votacao == null)
                        const _EmptyVotingCard()
                      else ...[
                        _VotingInfoCard(
                          votacao: _votacao!,
                          quorum: _quorum,
                          presenceConfirmed: _presenceConfirmed,
                          onConfirmPresence: _sending ? null : _confirmPresence,
                        ),
                        const SizedBox(height: 12),
                        if (_hasVoted)
                          _VoteDoneCard(vote: _registeredVote)
                        else
                          _VoteButtons(
                            enabled: !_sending &&
                                _presenceConfirmed &&
                                _quorum?['quorum_atingido'] == true,
                            onVote: _vote,
                          ),
                      ],
                    ],
                    if (_tabIndex == 1)
                      _HistoricoView(
                        historico: _historicoPaginado,
                        totalFiltrado: _historicoFiltrado.length,
                        paginaAtual: _historicoPagina,
                        totalPaginas: _historicoTotalPaginas,
                        busca: _historicoBusca,
                        periodo: _historicoPeriodo,
                        ordenacao: _historicoOrdenacao,
                        onBuscaChanged: (value) {
                          setState(() {
                            _historicoBusca = value;
                            _historicoPagina = 1;
                          });
                        },
                        onPeriodoChanged: (value) {
                          setState(() {
                            _historicoPeriodo = value;
                            _historicoPagina = 1;
                          });
                        },
                        onOrdenacaoChanged: (value) {
                          setState(() {
                            _historicoOrdenacao = value;
                            _historicoPagina = 1;
                          });
                        },
                        onPaginaAnterior: _historicoPagina > 1
                            ? () => setState(() => _historicoPagina -= 1)
                            : null,
                        onPaginaSeguinte: _historicoPagina < _historicoTotalPaginas
                            ? () => setState(() => _historicoPagina += 1)
                            : null,
                        loadingAta: _loadingAta,
                        onSelecionarAta: _carregarAta,
                      ),
                    if (_tabIndex == 2)
                      _AtaView(
                        ata: _ataSelecionada,
                        onAbrirPdf: _abrirPdfAta,
                        fallback: _ataSelecionadaId == null
                            ? 'Selecione uma votacao no Historico para carregar a ata.'
                            : 'Carregando ata...',
                      ),
                    if (_tabIndex == 3)
                      _RelatoriosView(
                        sessoes: _sessoesRelatorio,
                        sessaoDetalhe: _sessaoDetalhe,
                        sessaoDetalheId: _sessaoDetalheId,
                        loadingSessaoDetalhe: _loadingSessaoDetalhe,
                        onSelecionarSessao: _carregarSessaoDetalhe,
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _TopTab extends StatelessWidget {
  const _TopTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.white12,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: selected ? Colors.black87 : Colors.white,
          ),
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({
    required this.message,
    required this.partido,
    required this.cadeira,
  });

  final String message;
  final String partido;
  final String cadeira;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF0F172A),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w900,
              ),
            ),
            if (message.toLowerCase().contains('aguardando')) ...[
              const SizedBox(height: 10),
              const Row(
                children: [
                  _WaitingVoteIconSmall(),
                  SizedBox(width: 10),
                  Text(
                    'Aguardando votacao',
                    style: TextStyle(color: Colors.white70),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 6),
            Text(
              'Partido: $partido | Cadeira: $cadeira',
              style: const TextStyle(color: Colors.white70, fontSize: 15),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyVotingCard extends StatelessWidget {
  const _EmptyVotingCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(26),
        child: Column(
          children: [
            _WaitingVoteIcon(),
            SizedBox(height: 14),
            Text(
              'Aguardando abertura de votacao',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
            ),
            SizedBox(height: 8),
            Text(
              'Assim que abrir, voce vota por aqui.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }
}

class _VotingInfoCard extends StatelessWidget {
  const _VotingInfoCard({
    required this.votacao,
    required this.quorum,
    required this.presenceConfirmed,
    required this.onConfirmPresence,
  });

  final Map<String, dynamic> votacao;
  final Map<String, dynamic>? quorum;
  final bool presenceConfirmed;
  final VoidCallback? onConfirmPresence;

  @override
  Widget build(BuildContext context) {
    final pauta = votacao['pautas'] as Map<String, dynamic>?;
    final present = quorum?['presentes'] ?? 0;
    final quorumOk = quorum?['quorum_atingido'] == true;
    final tipoMaioria = pauta?['tipo_maioria']?.toString() ?? '-';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              pauta?['titulo']?.toString() ?? 'Pauta sem titulo',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
            ),
            if (pauta?['descricao'] != null) ...[
              const SizedBox(height: 8),
              Text(pauta!['descricao'].toString()),
            ],
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _Badge(label: 'Presentes', value: '$present'),
                _Badge(label: 'Quorum', value: quorumOk ? 'OK' : 'Insuficiente'),
                _Badge(label: 'Maioria', value: tipoMaioria),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 68,
              child: FilledButton.icon(
                onPressed: presenceConfirmed ? null : onConfirmPresence,
                icon:
                    Icon(presenceConfirmed ? Icons.check_circle : Icons.person_add),
                label: Text(
                  presenceConfirmed ? 'Presenca confirmada' : 'Confirmar presenca',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFE2E8F0),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        '$label: $value',
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _VoteButtons extends StatelessWidget {
  const _VoteButtons({required this.enabled, required this.onVote});

  final bool enabled;
  final Future<void> Function(String vote) onVote;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 210,
      child: Row(
        children: [
          Expanded(
            child: _VoteButton(
              label: 'SIM',
              color: Colors.green.shade700,
              enabled: enabled,
              onPressed: () => onVote('SIM'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _VoteButton(
              label: 'NAO',
              color: Colors.red.shade700,
              enabled: enabled,
              onPressed: () => onVote('NAO'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _VoteButton(
              label: 'ABSTER',
              color: Colors.amber.shade700,
              enabled: enabled,
              onPressed: () => onVote('ABSTENCAO'),
            ),
          ),
        ],
      ),
    );
  }
}

class _VoteButton extends StatelessWidget {
  const _VoteButton({
    required this.label,
    required this.color,
    required this.enabled,
    required this.onPressed,
  });

  final String label;
  final Color color;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: color,
        disabledBackgroundColor: Colors.grey.shade500,
        textStyle: const TextStyle(fontSize: 38, fontWeight: FontWeight.w900),
      ),
      onPressed: enabled ? onPressed : null,
      child: Text(label),
    );
  }
}

class _UserAvatar extends StatelessWidget {
  const _UserAvatar({
    required this.nome,
    this.fotoUrl,
    this.fotoBase64,
    this.onTap,
  });

  final String nome;
  final String? fotoUrl;
  final String? fotoBase64;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final inicial = nome.isNotEmpty ? nome.trim()[0].toUpperCase() : 'V';
    final hasLocalPhoto = fotoBase64 != null && fotoBase64!.isNotEmpty;
    final hasRemotePhoto = fotoUrl != null && fotoUrl!.isNotEmpty;
    Uint8List? localBytes;

    if (hasLocalPhoto) {
      try {
        localBytes = base64Decode(fotoBase64!);
      } catch (_) {
        localBytes = null;
      }
    }

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Tooltip(
        message: 'Logado como $nome',
        child: CircleAvatar(
          radius: 18,
          backgroundColor: Colors.white24,
          backgroundImage: hasRemotePhoto
              ? NetworkImage(fotoUrl!)
              : (localBytes != null ? MemoryImage(localBytes) : null),
          child: (hasRemotePhoto || localBytes != null)
              ? null
              : Text(
                  inicial,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
        ),
      ),
    );
  }
}

class _WaitingVoteIcon extends StatefulWidget {
  const _WaitingVoteIcon();

  @override
  State<_WaitingVoteIcon> createState() => _WaitingVoteIconState();
}

class _WaitingVoteIconState extends State<_WaitingVoteIcon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _scale = Tween<double>(begin: 0.92, end: 1.08).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: const Icon(
        Icons.how_to_vote_outlined,
        size: 58,
        color: Color(0xFF2563EB),
      ),
    );
  }
}

class _WaitingVoteIconSmall extends StatefulWidget {
  const _WaitingVoteIconSmall();

  @override
  State<_WaitingVoteIconSmall> createState() => _WaitingVoteIconSmallState();
}

class _WaitingVoteIconSmallState extends State<_WaitingVoteIconSmall>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _scale = Tween<double>(begin: 0.92, end: 1.08).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: const Icon(
        Icons.hourglass_top_rounded,
        size: 20,
        color: Colors.white70,
      ),
    );
  }
}

class _VoteDoneCard extends StatelessWidget {
  const _VoteDoneCard({required this.vote});

  final String? vote;

  @override
  Widget build(BuildContext context) {
    final text = switch (vote) {
      'NAO' => 'NAO',
      'ABSTENCAO' => 'ABSTENCAO',
      _ => vote ?? '-',
    };

    return Card(
      color: Colors.green.shade900,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 56),
            const SizedBox(height: 12),
            const Text(
              'Voto registrado',
              style: TextStyle(color: Colors.white, fontSize: 24),
            ),
            const SizedBox(height: 6),
            Text(
              text,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 38,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HistoricoView extends StatelessWidget {
  const _HistoricoView({
    required this.historico,
    required this.totalFiltrado,
    required this.paginaAtual,
    required this.totalPaginas,
    required this.busca,
    required this.periodo,
    required this.ordenacao,
    required this.onBuscaChanged,
    required this.onPeriodoChanged,
    required this.onOrdenacaoChanged,
    required this.onPaginaAnterior,
    required this.onPaginaSeguinte,
    required this.loadingAta,
    required this.onSelecionarAta,
  });

  final List<Map<String, dynamic>> historico;
  final int totalFiltrado;
  final int paginaAtual;
  final int totalPaginas;
  final String busca;
  final String periodo;
  final String ordenacao;
  final ValueChanged<String> onBuscaChanged;
  final ValueChanged<String> onPeriodoChanged;
  final ValueChanged<String> onOrdenacaoChanged;
  final VoidCallback? onPaginaAnterior;
  final VoidCallback? onPaginaSeguinte;
  final bool loadingAta;
  final Future<void> Function(String votacaoId) onSelecionarAta;

  @override
  Widget build(BuildContext context) {
    final buscaController = TextEditingController(text: busca);
    buscaController.selection = TextSelection.fromPosition(
      TextPosition(offset: buscaController.text.length),
    );

    if (historico.isEmpty) {
      return Column(
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  TextField(
                    controller: buscaController,
                    onChanged: onBuscaChanged,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      labelText: 'Buscar por pauta, sessao ou id',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: periodo,
                    items: const [
                      DropdownMenuItem(value: 'todos', child: Text('Todo periodo')),
                      DropdownMenuItem(value: 'hoje', child: Text('Somente hoje')),
                      DropdownMenuItem(value: '7dias', child: Text('Ultimos 7 dias')),
                    ],
                    onChanged: (v) {
                      if (v != null) onPeriodoChanged(v);
                    },
                    decoration: const InputDecoration(
                      labelText: 'Periodo',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: ordenacao,
                    items: const [
                      DropdownMenuItem(
                        value: 'recentes',
                        child: Text('Mais recentes'),
                      ),
                      DropdownMenuItem(
                        value: 'antigas',
                        child: Text('Mais antigas'),
                      ),
                      DropdownMenuItem(
                        value: 'sessao',
                        child: Text('Sessao A-Z'),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) onOrdenacaoChanged(v);
                    },
                    decoration: const InputDecoration(
                      labelText: 'Ordenacao',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                totalFiltrado == 0
                    ? 'Nenhuma votacao encontrada para os filtros.'
                    : 'Nenhuma votacao nesta pagina.',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                TextField(
                  controller: buscaController,
                  onChanged: onBuscaChanged,
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    labelText: 'Buscar por pauta, sessao ou id',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: periodo,
                  items: const [
                    DropdownMenuItem(value: 'todos', child: Text('Todo periodo')),
                    DropdownMenuItem(value: 'hoje', child: Text('Somente hoje')),
                    DropdownMenuItem(value: '7dias', child: Text('Ultimos 7 dias')),
                  ],
                  onChanged: (v) {
                    if (v != null) onPeriodoChanged(v);
                  },
                  decoration: const InputDecoration(
                    labelText: 'Periodo',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: ordenacao,
                  items: const [
                    DropdownMenuItem(
                      value: 'recentes',
                      child: Text('Mais recentes'),
                    ),
                    DropdownMenuItem(
                      value: 'antigas',
                      child: Text('Mais antigas'),
                    ),
                    DropdownMenuItem(
                      value: 'sessao',
                      child: Text('Sessao A-Z'),
                    ),
                  ],
                  onChanged: (v) {
                    if (v != null) onOrdenacaoChanged(v);
                  },
                  decoration: const InputDecoration(
                    labelText: 'Ordenacao',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
        ),
        ...historico.map((item) {
          final pauta = item['pautas'] as Map<String, dynamic>?;
          final titulo = pauta?['titulo']?.toString() ?? 'Sem titulo';
          final sessao = pauta?['sessoes'] as Map<String, dynamic>?;
          final sessaoTitulo = sessao?['titulo']?.toString() ?? 'Sessao sem titulo';
          final encerradaEm = item['encerrada_em']?.toString() ?? '-';
          final id = item['id']?.toString() ?? '';

          return Card(
            child: ListTile(
              title: Text(titulo),
              subtitle: Text('Sessao: $sessaoTitulo\nEncerrada: $encerradaEm'),
              trailing: FilledButton(
                onPressed: loadingAta || id.isEmpty
                    ? null
                    : () {
                        onSelecionarAta(id);
                      },
                child: Text(loadingAta ? 'Carregando...' : 'Ver ata'),
              ),
            ),
          );
        }),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Total filtrado: $totalFiltrado'),
                Row(
                  children: [
                    IconButton(
                      onPressed: onPaginaAnterior,
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Text('Pagina $paginaAtual/$totalPaginas'),
                    IconButton(
                      onPressed: onPaginaSeguinte,
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AtaView extends StatelessWidget {
  const _AtaView({
    required this.ata,
    required this.onAbrirPdf,
    required this.fallback,
  });

  final Map<String, dynamic>? ata;
  final VoidCallback onAbrirPdf;
  final String fallback;

  @override
  Widget build(BuildContext context) {
    if (ata == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Text(
            fallback,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    final pauta = ata!['pauta'] as Map<String, dynamic>?;
    final resultado = ata!['resultado']?.toString() ?? '-';
    final resumo = ata!['texto_resumo']?.toString() ?? '-';
    final totais = ata!['totais'] as Map<String, dynamic>? ?? {};
    final presentes = (ata!['presentes'] as List?) ?? [];
    final ausentes = (ata!['ausentes'] as List?) ?? [];
    final votos = (ata!['votos'] as List?) ?? [];
    final resultadoStyle = _resultadoStyle(resultado);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              pauta?['titulo']?.toString() ?? 'Ata de votacao',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _Badge(label: 'Resultado', value: resultado),
                _ResultPill(
                  label: resultadoStyle.$1,
                  background: resultadoStyle.$2,
                  foreground: resultadoStyle.$3,
                ),
                _Badge(label: 'SIM', value: '${totais['sim'] ?? 0}'),
                _Badge(label: 'NAO', value: '${totais['nao'] ?? 0}'),
                _Badge(label: 'ABST', value: '${totais['abstencao'] ?? 0}'),
                _Badge(label: 'Presentes', value: '${presentes.length}'),
                _Badge(label: 'Ausentes', value: '${ausentes.length}'),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              resumo,
              style: const TextStyle(fontSize: 15),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: onAbrirPdf,
              icon: const Icon(Icons.picture_as_pdf),
              label: const Text('Abrir PDF oficial'),
            ),
            const SizedBox(height: 14),
            const Divider(),
            const SizedBox(height: 8),
            Text(
              'Presentes (${presentes.length})',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            ...presentes.map((item) {
              final nome = item['nome']?.toString() ?? '-';
              final partido = item['partido']?.toString() ?? '-';
              final cadeira = item['cadeira']?.toString() ?? '-';
              return ListTile(
                dense: true,
                leading: const Icon(Icons.person),
                title: Text(nome),
                subtitle: Text('Partido: $partido | Cadeira: $cadeira'),
              );
            }),
            const SizedBox(height: 8),
            Text(
              'Ausentes (${ausentes.length})',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            ...ausentes.map((item) {
              final nome = item['nome']?.toString() ?? '-';
              final partido = item['partido']?.toString() ?? '-';
              final cadeira = item['cadeira']?.toString() ?? '-';
              return ListTile(
                dense: true,
                leading: const Icon(Icons.person_off),
                title: Text(nome),
                subtitle: Text('Partido: $partido | Cadeira: $cadeira'),
              );
            }),
            const SizedBox(height: 8),
            Text(
              'Votos nominais (${votos.length})',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            ...votos.map((item) {
              final nome = item['nome']?.toString() ?? '-';
              final voto = item['voto']?.toString() ?? '-';
              final partido = item['partido']?.toString() ?? '-';
              final cadeira = item['cadeira']?.toString() ?? '-';
              return ListTile(
                dense: true,
                leading: const Icon(Icons.how_to_vote),
                title: Text(nome),
                subtitle: Text('Voto: $voto | Partido: $partido | Cadeira: $cadeira'),
              );
            }),
          ],
        ),
      ),
    );
  }

  (String, Color, Color) _resultadoStyle(String valor) {
    final normalized = valor.toUpperCase();
    if (normalized.contains('APROVADA')) {
      return ('APROVADA', Colors.green.shade700, Colors.white);
    }
    if (normalized.contains('REJEITADA')) {
      return ('REJEITADA', Colors.red.shade700, Colors.white);
    }
    if (normalized.contains('SEM QUORUM')) {
      return ('SEM QUORUM', Colors.orange.shade700, Colors.white);
    }
    if (normalized.contains('EMPATE')) {
      return ('EMPATE', Colors.blueGrey.shade700, Colors.white);
    }
    return (valor, Colors.grey.shade700, Colors.white);
  }
}

class _ResultPill extends StatelessWidget {
  const _ResultPill({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _RelatoriosView extends StatelessWidget {
  const _RelatoriosView({
    required this.sessoes,
    required this.sessaoDetalhe,
    required this.sessaoDetalheId,
    required this.loadingSessaoDetalhe,
    required this.onSelecionarSessao,
  });

  final List<Map<String, dynamic>> sessoes;
  final Map<String, dynamic>? sessaoDetalhe;
  final String? sessaoDetalheId;
  final bool loadingSessaoDetalhe;
  final Future<void> Function(String sessaoId) onSelecionarSessao;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Sessoes',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 10),
                if (sessoes.isEmpty)
                  const Text('Nenhuma sessao encontrada.')
                else
                  ...sessoes.map((sessao) {
                    final id = sessao['id']?.toString() ?? '';
                    final titulo = sessao['titulo']?.toString() ?? 'Sem titulo';
                    final data = sessao['data_sessao']?.toString() ?? '-';
                    final totalPautas = sessao['total_pautas']?.toString() ?? '0';
                    final totalVotacoes =
                        sessao['total_votacoes']?.toString() ?? '0';
                    final presencas = sessao['presencas']?.toString() ?? '0';
                    final selected = sessaoDetalheId == id;

                    return Card(
                      color: selected ? const Color(0xFFE0ECFF) : null,
                      child: ListTile(
                        title: Text(titulo),
                        subtitle: Text(
                          'Data: $data\nPautas: $totalPautas | Votacoes: $totalVotacoes | Presencas: $presencas',
                        ),
                        trailing: FilledButton(
                          onPressed: loadingSessaoDetalhe || id.isEmpty
                              ? null
                              : () => onSelecionarSessao(id),
                          child: Text(
                            loadingSessaoDetalhe && selected
                                ? 'Carregando...'
                                : 'Detalhar',
                          ),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        _SessaoDetalheCard(sessaoDetalhe: sessaoDetalhe),
      ],
    );
  }
}

class _SessaoDetalheCard extends StatelessWidget {
  const _SessaoDetalheCard({required this.sessaoDetalhe});

  final Map<String, dynamic>? sessaoDetalhe;

  @override
  Widget build(BuildContext context) {
    if (sessaoDetalhe == null) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Text(
            'Selecione uma sessao para ver o detalhamento.',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    final titulo = sessaoDetalhe!['titulo']?.toString() ?? 'Sessao';
    final data = sessaoDetalhe!['data_sessao']?.toString() ?? '-';
    final presencas = (sessaoDetalhe!['presencas'] as List?) ?? [];
    final pautas = (sessaoDetalhe!['pautas'] as List?) ?? [];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              titulo,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text('Data: $data'),
            const SizedBox(height: 12),
            Text(
              'Presencas (${presencas.length})',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            ...presencas.map((item) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.person),
                  title: Text(item['nome']?.toString() ?? '-'),
                  subtitle: Text(
                    'Partido: ${item['partido']?.toString() ?? '-'} | Cadeira: ${item['cadeira']?.toString() ?? '-'}',
                  ),
                )),
            const SizedBox(height: 10),
            Text(
              'Pautas e votacoes (${pautas.length})',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            ...pautas.map((pauta) {
              final votacoes = (pauta['votacoes'] as List?) ?? [];
              return Card(
                color: const Color(0xFFF8FAFC),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Pauta ${pauta['numero_ordem']}: ${pauta['titulo']?.toString() ?? '-'}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text('Maioria: ${pauta['tipo_maioria'] ?? '-'}'),
                      const SizedBox(height: 6),
                      ...votacoes.map((votacao) {
                        final totais =
                            (votacao['totais'] as Map<String, dynamic>?) ?? {};
                        return ListTile(
                          dense: true,
                          title: Text('Votacao ${votacao['status'] ?? '-'}'),
                          subtitle: Text(
                            'SIM ${totais['sim'] ?? 0} | NAO ${totais['nao'] ?? 0} | ABS ${totais['abstencao'] ?? 0} | TOTAL ${totais['total'] ?? 0}',
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
