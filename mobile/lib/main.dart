import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config/app_config.dart';
import 'services/api_client.dart';
import 'services/realtime_service.dart';

void main() {
  runApp(const CamaraVotacaoApp());
}

class _AppColors {
  static const background = Color(0xFFF3F7FB);
  static const navy = Color(0xFF081225);
  static const navy2 = Color(0xFF10213D);
  static const blue = Color(0xFF1455D9);
  static const cyan = Color(0xFF10B7D9);
  static const green = Color(0xFF0F9F6E);
  static const amber = Color(0xFFD99114);
  static const red = Color(0xFFDC2626);
  static const text = Color(0xFF061126);
  static const muted = Color(0xFF58667E);
  static const border = Color(0xFFD9E3F0);
}

const Map<String, String> _etapaLabels = {
  'ABERTURA': 'Abertura',
  'LEITURA_BIBLICA': 'Leitura b\u00edblica',
  'CHAMADA_VEREADORES': 'Chamada dos vereadores',
  'VERIFICACAO_QUORUM': 'Verifica\u00e7\u00e3o de qu\u00f3rum',
  'LEITURA_EXPEDIENTE': 'Leitura do expediente',
  'PEQUENAS_COMUNICACOES': 'Pequenas comunica\u00e7\u00f5es',
  'GRANDE_EXPEDIENTE': 'Grande expediente',
  'ORDEM_DO_DIA': 'Ordem do dia',
  'RESULTADO': 'Resultado',
  'EXPLICACOES_PESSOAIS': 'Explica\u00e7\u00f5es pessoais',
  'ENCERRAMENTO': 'Encerramento',
};

const Map<String, String> _tipoFalaLabels = {
  'PEQUENAS_COMUNICACOES': 'Pequenas comunica\u00e7\u00f5es',
  'GRANDE_EXPEDIENTE': 'Grande expediente',
  'ORDEM_DO_DIA': 'Ordem do dia',
  'EXPLICACOES_PESSOAIS': 'Explica\u00e7\u00f5es pessoais',
};

String _labelEtapa(String? etapa) => _etapaLabels[etapa] ?? 'Aguardando';

String _labelTipoFala(String tipo) => _tipoFalaLabels[tipo] ?? tipo;

String? _normalizarUrlMidia(String? url) {
  final value = url?.trim();
  if (value == null || value.isEmpty) return null;
  if (value.startsWith('data:image')) return value;

  final match = RegExp(r'/uploads/([^?#]+)').firstMatch(value);
  if (match != null) {
    return '${AppConfig.apiBaseUrl.replaceAll(RegExp(r'/$'), '')}/uploads/${match.group(1)}';
  }

  return value;
}

class CamaraVotacaoApp extends StatelessWidget {
  const CamaraVotacaoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SILCAM Tablet',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1455D9)),
        scaffoldBackgroundColor: _AppColors.background,
        useMaterial3: true,
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: const BorderSide(color: _AppColors.border),
          ),
        ),
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
      _showSnack('Confirme sua presen\u00e7a antes de votar.');
      return;
    }
    if (_quorum?['quorum_atingido'] != true) {
      _showSnack('Qu\u00f3rum m\u00ednimo ainda n\u00e3o foi atingido.');
      return;
    }
    if (_presidenteJaVotou) {
      _showSnack('Voc\u00ea j\u00e1 votou nesta vota\u00e7\u00e3o.');
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
                    labelText: 'C\u00f3digo de 6 d\u00edgitos',
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
    final fotoUrl = _normalizarUrlMidia(_usuarioAtual?['foto_url']?.toString());
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
                            temVotacaoAtiva ? 'Vota\u00e7\u00e3o em andamento' : 'Nenhuma vota\u00e7\u00e3o aberta',
                            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            temVotacaoAtiva
                                ? (_votacaoAtiva?['pautas']?['titulo']?.toString() ?? 'Vota\u00e7\u00e3o ativa')
                                : 'Aguardando abertura',
                          ),
                          const SizedBox(height: 12),
                          if (_quorum != null)
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                _Badge(label: 'Presentes', value: '${_quorum!['presentes'] ?? 0}'),
                                _Badge(label: 'Qu\u00f3rum', value: _quorum!['quorum_atingido'] == true ? 'OK' : 'Insuficiente'),
                              ],
                            ),
                          const SizedBox(height: 12),
                          if (temVotacaoAtiva)
                            SizedBox(
                              height: 56,
                              child: FilledButton(
                                onPressed: _sending ? null : _encerrarVotacao,
                                child: const Text('Encerrar vota\u00e7\u00e3o'),
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
                                            ? 'Presen\u00e7a confirmada'
                                            : 'Confirmar presen\u00e7a',
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
                                              child: const Text('N\u00c3O'),
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
                            final titulo = pauta['titulo']?.toString() ?? 'Sem t\u00edtulo';
                            final temAberta =
                                (pauta['votacoes'] as List?)?.any((v) => v['status'] == 'ABERTA') == true;
                            return ListTile(
                              title: Text(titulo),
                              subtitle: Text('Ordem ${pauta['numero_ordem'] ?? '-'}'),
                              trailing: FilledButton(
                                onPressed: _sending || temVotacaoAtiva || temAberta || id.isEmpty
                                    ? null
                                    : () => _abrirVotacao(id),
                                child: const Text('Iniciar vota\u00e7\u00e3o'),
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
  Map<String, dynamic>? _configCamara;

  @override
  void initState() {
    super.initState();
    _loadConfigCamara();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _senhaController.dispose();
    _twoFactorController.dispose();
    super.dispose();
  }

  Future<void> _loadConfigCamara() async {
    final config = await widget.api.configuracaoCamara();
    if (!mounted) return;
    setState(() => _configCamara = config);
  }

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
          _error = 'Informe o codigo 2FA para continuar.';
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
    final nomeCamara =
        _configCamara?['nome_oficial']?.toString().trim().isNotEmpty == true
            ? _configCamara!['nome_oficial'].toString().trim()
            : 'C\u00e2mara Municipal';
    final brasaoUrl = _normalizarUrlMidia(_configCamara?['brasao_url']?.toString());

    return Scaffold(
      backgroundColor: _AppColors.navy,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(30),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Column(
                      children: [
                        _CamaraLogoMark(brasaoUrl: brasaoUrl),
                        const SizedBox(height: 16),
                        const Text(
                          'SILCAM',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: _AppColors.text,
                            fontSize: 30,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          nomeCamara,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: _AppColors.blue,
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Acesso do vereador ao tablet de vota\u00e7\u00e3o',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: _AppColors.muted,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 26),
                  TextField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.mail_outline_rounded),
                      labelText: 'E-mail',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _senhaController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.lock_outline_rounded),
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
                        prefixIcon: Icon(Icons.verified_user_outlined),
                        labelText: 'C\u00f3digo 2FA (6 d\u00edgitos)',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _login(),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFEBEE),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFFFCDD2)),
                      ),
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          color: _AppColors.red,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  SizedBox(
                    height: 58,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: _AppColors.blue,
                        disabledBackgroundColor: const Color(0xFFCBD5E1),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      onPressed: _loading ? null : _login,
                      icon: _loading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.4,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.login_rounded),
                      label: Text(
                        _loading ? 'Entrando...' : 'Entrar',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'Sistema legislativo com presen\u00e7a, fala e vota\u00e7\u00e3o em tempo real.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _AppColors.muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
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

class _CamaraLogoMark extends StatelessWidget {
  const _CamaraLogoMark({this.brasaoUrl});

  final String? brasaoUrl;

  @override
  Widget build(BuildContext context) {
    final image = _buildImage();

    return Container(
      width: 88,
      height: 88,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FBFF),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: _AppColors.border),
        boxShadow: [
          BoxShadow(
            color: _AppColors.blue.withValues(alpha: 0.16),
            blurRadius: 22,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: image ??
          const Icon(
            Icons.account_balance_rounded,
            color: _AppColors.blue,
            size: 46,
          ),
    );
  }

  Widget? _buildImage() {
    final url = brasaoUrl?.trim();
    if (url == null || url.isEmpty) return null;

    if (url.startsWith('data:image')) {
      final comma = url.indexOf(',');
      if (comma <= 0 || comma >= url.length - 1) return null;
      try {
        final bytes = base64Decode(url.substring(comma + 1));
        return Image.memory(bytes, fit: BoxFit.contain);
      } catch (_) {
        return null;
      }
    }

    return Image.network(
      url,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => const Icon(
        Icons.account_balance_rounded,
        color: _AppColors.blue,
        size: 46,
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
  Map<String, dynamic>? _sessaoAtiva;
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
  String _message = 'Aguardando vota\u00e7\u00e3o...';
  Timer? _pendingSyncTimer;
  int _pendingActionsCount = 0;
  bool _syncingPending = false;
  int _tabIndex = 0;
  String _etapaSessao = 'ABERTURA';
  String _tipoFalaPedido = 'PEQUENAS_COMUNICACOES';
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
      onVotacaoAtualizada: (_) => _loadAllData(message: 'Vota\u00e7\u00e3o atualizada'),
      onVotacaoEncerrada: (_) => _loadAllData(message: 'Vota\u00e7\u00e3o encerrada'),
      onVotoRegistrado: (_) => _loadAllData(message: 'Novo voto registrado'),
      onPresencaAtualizada: (_) => _loadAllData(message: 'Presen\u00e7a atualizada'),
      onSessaoEtapaAtualizada: (data) {
        final etapa = data is Map ? data['etapa']?.toString() : null;
        _loadAllData(message: etapa == null ? 'Etapa atualizada' : _labelEtapa(etapa));
      },
      onOradorAtualizado: (_) => _loadAllData(message: 'Ordem de fala atualizada'),
      onFilaOradoresAtualizada: (_) => _loadAllData(message: 'Fila de fala atualizada'),
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
      final sessaoAtiva = await widget.api.sessaoAtiva();
      final historico = await widget.api.votacoesEncerradas();
      final sessoesRelatorio = await widget.api.relatorioSessoes();

      Map<String, dynamic>? quorum;
      var presenceConfirmed = false;
      var etapaSessao =
          sessaoAtiva?['etapa']?.toString() ?? sessaoAtiva?['etapa_atual']?.toString();
      final sessaoId = sessaoAtiva?['id']?.toString() ??
          votacao?['pautas']?['sessao_id']?.toString();
      final vereadorId = usuario['vereador']?['id']?.toString();

      if (sessaoId != null) {
        final etapa = await widget.api.etapaSessao(sessaoId);
        etapaSessao = etapa['etapa']?.toString() ?? etapaSessao ?? 'ABERTURA';
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
        _sessaoAtiva = sessaoAtiva;
        _quorum = quorum;
        _etapaSessao = etapaSessao ?? 'ABERTURA';
        _presenceConfirmed = presenceConfirmed;
        _historico = historico;
        _sessoesRelatorio = sessoesRelatorio;
        _historicoPagina = 1;
        _message = message ??
            (votacao != null
                ? 'Vota\u00e7\u00e3o aberta'
                : sessaoAtiva != null
                    ? _labelEtapa(etapaSessao)
                    : 'Aguardando sess\u00e3o...');
      });
      await _loadAvatarLocal();
    } catch (error) {
      if (_isUnauthorized(error)) {
        await _forceLogout('Sess\u00e3o expirada. Entre novamente.');
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
    final sessaoId = _sessaoAtiva?['id']?.toString() ??
        _votacao?['pautas']?['sessao_id']?.toString();
    if (sessaoId == null) {
      _showSnack('Nenhuma sess\u00e3o ativa.');
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
          _showSnack('Sem conex\u00e3o. Presen\u00e7a enfileirada para sincronizar.');
          return;
        }
        rethrow;
      }
      await _loadAllData(message: 'Presen\u00e7a confirmada');
    });
  }

  List<String> get _tiposFalaPermitidos {
    if (_etapaSessao == 'PEQUENAS_COMUNICACOES') {
      return const ['PEQUENAS_COMUNICACOES'];
    }
    if (_etapaSessao == 'GRANDE_EXPEDIENTE') {
      return const ['GRANDE_EXPEDIENTE'];
    }
    if (_etapaSessao == 'ORDEM_DO_DIA') {
      return const ['ORDEM_DO_DIA'];
    }
    if (_etapaSessao == 'EXPLICACOES_PESSOAIS') {
      return const ['EXPLICACOES_PESSOAIS'];
    }
    return const [];
  }

  Future<void> _solicitarFala() async {
    final sessaoId = _sessaoAtiva?['id']?.toString() ??
        _votacao?['pautas']?['sessao_id']?.toString();
    if (sessaoId == null) {
      _showSnack('Nenhuma sess\u00e3o ativa.');
      return;
    }
    if (_tiposFalaPermitidos.isEmpty) {
      _showSnack('Pedido de fala indispon\u00edvel nesta etapa.');
      return;
    }

    await _runSending(() async {
      final tipo = _tiposFalaPermitidos.contains(_tipoFalaPedido)
          ? _tipoFalaPedido
          : _tiposFalaPermitidos.first;
      final resposta = await widget.api.solicitarFala(sessaoId, tipo);
      _showSnack(resposta['mensagem']?.toString() ?? 'Pedido enviado.');
      await _loadAllData(message: 'Pedido de fala enviado');
    });
  }

  Future<void> _vote(String vote) async {
    if (_votacao == null) {
      _showSnack('Nenhuma vota\u00e7\u00e3o aberta.');
      return;
    }
    if (!_presenceConfirmed) {
      _showSnack('Confirme sua presen\u00e7a antes de votar.');
      return;
    }
    if (_quorum?['quorum_atingido'] != true) {
      _showSnack('Qu\u00f3rum m\u00ednimo ainda n\u00e3o foi atingido.');
      return;
    }
    if (_hasVoted) {
      _showSnack('Voc\u00ea j\u00e1 votou nesta vota\u00e7\u00e3o.');
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
          _showSnack('Sem conex\u00e3o. Voto enfileirado para sincronizar.');
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
      await _loadAllData(message: 'Sincroniza\u00e7\u00e3o conclu\u00edda');
    }
  }

  Future<bool?> _confirmarVoto(String voto) {
    final votoExibicao = switch (voto) {
      'NAO' => 'N\u00c3O',
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
      _showSnack('N\u00e3o foi poss\u00edvel abrir o PDF.');
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
        _showSnack('N\u00e3o foi poss\u00edvel remover no servidor, removendo localmente.');
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
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _AvatarActionIcon(
                  icon: Icons.add_photo_alternate_outlined,
                  tooltip: 'Adicionar foto',
                  accent: _AppColors.blue,
                  onTap: () async {
                    Navigator.of(context).pop();
                    await _pickAvatarFromGallery();
                  },
                ),
                const SizedBox(width: 14),
                _AvatarActionIcon(
                  icon: Icons.delete_outline_rounded,
                  tooltip: 'Remover foto',
                  accent: _AppColors.red,
                  onTap: () async {
                    Navigator.of(context).pop();
                    await _removeAvatarLocal();
                  },
                ),
              ],
            ),
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
      await _forceLogout('Sess\u00e3o expirada. Entre novamente.');
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
    final partidoLogoUrl = _normalizarUrlMidia(
      vereador?['partido_logo_url']?.toString() ??
          vereador?['partidoLogoUrl']?.toString() ??
          vereador?['logo_partido_url']?.toString() ??
          (_usuario?['partido_logo_url']?.toString()),
    );

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
          title: const Text('Acesso n\u00e3o permitido'),
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
                  'Este aplicativo de vota\u00e7\u00e3o est\u00e1 habilitado apenas para perfil de vereador.',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ),
        ),
      );
    }

    final hasSession = _sessaoAtiva != null ||
        _votacao?['pautas']?['sessao_id'] != null;

    return Scaffold(
      backgroundColor: _AppColors.background,
      appBar: AppBar(
        backgroundColor: _AppColors.navy,
        foregroundColor: Colors.white,
        toolbarHeight: 76,
        titleSpacing: 20,
        title: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white24),
              ),
              child: _PartyLogoBadge(logoUrl: partidoLogoUrl, partido: partido),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Partido: $partido · Cadeira: $cadeira',
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.2,
                  ),
                ),
                Text(
                  userName,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          _TabletStatusPill(
            online: _connected,
            syncing: _syncingPending,
            pendingActions: _pendingActionsCount,
          ),
          const SizedBox(width: 10),
          _UserAvatar(
            nome: userName,
            fotoBase64: _avatarLocalBase64,
            fotoUrl: _normalizarUrlMidia(
              _usuario?['foto_url']?.toString() ??
                  _usuario?['avatar_url']?.toString(),
            ),
            onTap: _onAvatarTap,
          ),
          IconButton(
            onPressed: _loadAllData,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Atualizar',
          ),
          IconButton(
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Sair',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: _AppColors.blue))
            : RefreshIndicator(
                onRefresh: _loadAllData,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
                  children: [
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        _TopTab(
                          label: 'Sess\u00e3o',
                          icon: Icons.event_available_rounded,
                          selected: _tabIndex == 0,
                          onTap: () => setState(() => _tabIndex = 0),
                        ),
                        _TopTab(
                          label: 'Hist\u00f3rico',
                          icon: Icons.history_rounded,
                          selected: _tabIndex == 1,
                          onTap: () => setState(() => _tabIndex = 1),
                        ),
                        _TopTab(
                          label: 'Ata',
                          icon: Icons.description_rounded,
                          selected: _tabIndex == 2,
                          onTap: () => setState(() => _tabIndex = 2),
                        ),
                        _TopTab(
                          label: 'Relat\u00f3rios',
                          icon: Icons.analytics_rounded,
                          selected: _tabIndex == 3,
                          onTap: () => setState(() => _tabIndex = 3),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
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
                      _SessionHeroCard(
                        sessao: _sessaoAtiva,
                        etapa: _etapaSessao,
                        message: _message,
                        hasVoting: _votacao != null,
                        quorum: _quorum,
                        presenceConfirmed: _presenceConfirmed,
                        onConfirmPresence:
                            hasSession && !_presenceConfirmed && !_sending
                                ? _confirmPresence
                                : null,
                      ),
                      const SizedBox(height: 12),
                      _SpeechRequestCard(
                        enabled: hasSession &&
                            _tiposFalaPermitidos.isNotEmpty &&
                            !_sending,
                        tiposPermitidos: _tiposFalaPermitidos,
                        tipoSelecionado: _tipoFalaPedido,
                        onTipoChanged: (value) {
                          if (value == null) return;
                          setState(() => _tipoFalaPedido = value);
                        },
                        onSolicitar: _solicitarFala,
                        etapa: _etapaSessao,
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
                            ? 'Selecione uma vota\u00e7\u00e3o no Hist\u00f3rico para carregar a ata.'
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
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? _AppColors.navy : Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? _AppColors.navy : _AppColors.border,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: _AppColors.blue.withValues(alpha: 0.18),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 18,
              color: selected ? Colors.white : _AppColors.blue,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w900,
                color: selected ? Colors.white : _AppColors.text,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabletStatusPill extends StatelessWidget {
  const _TabletStatusPill({
    required this.online,
    required this.syncing,
    required this.pendingActions,
  });

  final bool online;
  final bool syncing;
  final int pendingActions;

  @override
  Widget build(BuildContext context) {
    final color = online ? Colors.greenAccent : Colors.orangeAccent;
    final label = syncing
        ? 'Sincronizando'
        : online
            ? 'Online'
            : 'Reconectando';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(online ? Icons.signal_cellular_alt_rounded : Icons.wifi_off_rounded,
              size: 18, color: color),
          const SizedBox(width: 7),
          Text(
            pendingActions > 0 ? '$label · $pendingActions pend.' : label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _SessionHeroCard extends StatelessWidget {
  const _SessionHeroCard({
    required this.sessao,
    required this.etapa,
    required this.message,
    required this.hasVoting,
    required this.quorum,
    required this.presenceConfirmed,
    required this.onConfirmPresence,
  });

  final Map<String, dynamic>? sessao;
  final String etapa;
  final String message;
  final bool hasVoting;
  final Map<String, dynamic>? quorum;
  final bool presenceConfirmed;
  final VoidCallback? onConfirmPresence;

  @override
  Widget build(BuildContext context) {
    final titulo = sessao?['titulo']?.toString() ?? 'Aguardando sess\u00e3o ativa';
    final descricao = sessao?['etapa_descricao']?.toString() ??
        sessao?['descricao']?.toString() ??
        'O tablet acompanha presen\u00e7a, fila de fala e vota\u00e7\u00e3o em tempo real.';
    final presentes = quorum?['presentes']?.toString() ?? '0';
    final total = quorum?['total_vereadores']?.toString() ?? '-';
    final quorumOk = quorum?['quorum_atingido'] == true;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOut,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_AppColors.navy, _AppColors.navy2],
        ),
        boxShadow: [
          BoxShadow(
            color: _AppColors.navy.withValues(alpha: 0.22),
            blurRadius: 24,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _DarkChip(
                  icon: Icons.event_note_rounded,
                  label: _labelEtapa(etapa),
                  color: _AppColors.cyan,
                ),
                if (hasVoting)
                  _DarkChip(
                    icon: Icons.how_to_vote_rounded,
                    label: 'Vota\u00e7\u00e3o aberta',
                    color: _AppColors.green,
                  ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              titulo,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.w900,
                height: 1.05,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              descricao,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 18),
            LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth > 720;
                final stats = [
                  _HeroMetric(
                    label: 'Presen\u00e7a',
                    value: '$presentes/$total',
                    tone: quorumOk ? _AppColors.green : _AppColors.amber,
                  ),
                  _HeroMetric(
                    label: 'Qu\u00f3rum',
                    value: quorumOk ? 'Atingido' : 'Pendente',
                    tone: quorumOk ? _AppColors.green : _AppColors.amber,
                  ),
                  _HeroMetric(
                    label: 'Confirma\u00e7\u00e3o',
                    value: presenceConfirmed ? 'Confirmada' : 'Pendente',
                    tone: presenceConfirmed ? _AppColors.green : _AppColors.cyan,
                  ),
                ];

                return Flex(
                  direction: isWide ? Axis.horizontal : Axis.vertical,
                  children: [
                    for (var i = 0; i < stats.length; i++) ...[
                      if (isWide) Expanded(child: stats[i]) else stats[i],
                      if (i != stats.length - 1)
                        SizedBox(
                          width: isWide ? 10 : 0,
                          height: isWide ? 0 : 10,
                        ),
                    ],
                    if (onConfirmPresence != null) ...[
                      SizedBox(width: isWide ? 10 : 0, height: isWide ? 0 : 10),
                      if (isWide)
                        Expanded(
                          child: SizedBox(
                            height: 58,
                            child: FilledButton.icon(
                              style: FilledButton.styleFrom(
                                backgroundColor: _AppColors.blue,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(18),
                                ),
                              ),
                              onPressed: onConfirmPresence,
                              icon: const Icon(Icons.person_add_alt_1_rounded),
                              label: const Text(
                                'Confirmar presen\u00e7a',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ),
                        )
                      else
                        SizedBox(
                          height: 58,
                          child: FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor: _AppColors.blue,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(18),
                              ),
                            ),
                            onPressed: onConfirmPresence,
                            icon: const Icon(Icons.person_add_alt_1_rounded),
                            label: const Text(
                              'Confirmar presen\u00e7a',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _DarkChip extends StatelessWidget {
  const _DarkChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 7),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroMetric extends StatelessWidget {
  const _HeroMetric({
    required this.label,
    required this.value,
    required this.tone,
  });

  final String label;
  final String value;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 74),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(
              color: tone,
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _SpeechRequestCard extends StatelessWidget {
  const _SpeechRequestCard({
    required this.enabled,
    required this.tiposPermitidos,
    required this.tipoSelecionado,
    required this.onTipoChanged,
    required this.onSolicitar,
    required this.etapa,
  });

  final bool enabled;
  final List<String> tiposPermitidos;
  final String tipoSelecionado;
  final ValueChanged<String?> onTipoChanged;
  final VoidCallback onSolicitar;
  final String etapa;

  @override
  Widget build(BuildContext context) {
    final opcoes = tiposPermitidos.isEmpty ? const ['PEQUENAS_COMUNICACOES'] : tiposPermitidos;
    final valor = opcoes.contains(tipoSelecionado) ? tipoSelecionado : opcoes.first;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isWide = constraints.maxWidth > 720;
            final dropdown = DropdownButtonFormField<String>(
              initialValue: valor,
              items: opcoes
                  .map(
                    (tipo) => DropdownMenuItem(
                      value: tipo,
                      child: Text(_labelTipoFala(tipo)),
                    ),
                  )
                  .toList(),
              onChanged: enabled ? onTipoChanged : null,
              decoration: const InputDecoration(
                labelText: 'Tipo de fala',
                border: OutlineInputBorder(),
              ),
            );
            final button = SizedBox(
              height: 58,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: _AppColors.blue,
                  disabledBackgroundColor: const Color(0xFFCBD5E1),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onPressed: enabled ? onSolicitar : null,
                icon: const Icon(Icons.record_voice_over_rounded),
                label: const Text(
                  'Pedir fala',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
            );

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Ordem de fala',
                  style: TextStyle(
                    color: _AppColors.text,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  enabled
                      ? 'Solicite sua inscri\u00e7\u00e3o na etapa ${_labelEtapa(etapa)}.'
                      : 'A fala ser\u00e1 liberada quando a etapa permitir pronunciamentos.',
                  style: const TextStyle(
                    color: _AppColors.muted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 14),
                if (isWide)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(flex: 2, child: dropdown),
                      const SizedBox(width: 12),
                      Expanded(child: button),
                    ],
                  )
                else
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      dropdown,
                      const SizedBox(height: 12),
                      button,
                    ],
                  ),
              ],
            );
          },
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
              'Aguardando abertura de vota\u00e7\u00e3o',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
            ),
            SizedBox(height: 8),
            Text(
              'Assim que abrir, voc\u00ea vota por aqui.',
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
              pauta?['titulo']?.toString() ?? 'Pauta sem t\u00edtulo',
              style: const TextStyle(
                color: _AppColors.text,
                fontSize: 24,
                fontWeight: FontWeight.w900,
              ),
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
                _Badge(label: 'Qu\u00f3rum', value: quorumOk ? 'OK' : 'Insuficiente'),
                _Badge(label: 'Maioria', value: tipoMaioria),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 68,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: _AppColors.blue,
                  disabledBackgroundColor: const Color(0xFFE2E8F0),
                  disabledForegroundColor: _AppColors.muted,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                onPressed: presenceConfirmed ? null : onConfirmPresence,
                icon:
                    Icon(presenceConfirmed ? Icons.check_circle : Icons.person_add),
                label: Text(
                  presenceConfirmed ? 'Presen\u00e7a confirmada' : 'Confirmar presen\u00e7a',
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
        color: const Color(0xFFEAF1FB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _AppColors.border),
      ),
      child: Text(
        '$label: $value',
        style: const TextStyle(
          color: _AppColors.text,
          fontWeight: FontWeight.bold,
        ),
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
              icon: Icons.thumb_up_alt_rounded,
              color: _AppColors.green,
              enabled: enabled,
              onPressed: () => onVote('SIM'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _VoteButton(
              label: 'N\u00c3O',
              icon: Icons.thumb_down_alt_rounded,
              color: _AppColors.red,
              enabled: enabled,
              onPressed: () => onVote('NAO'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _VoteButton(
              label: 'ABSTER',
              icon: Icons.do_not_disturb_on_total_silence_rounded,
              color: _AppColors.amber,
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
    required this.icon,
    required this.color,
    required this.enabled,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final Color color;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: color,
        disabledBackgroundColor: const Color(0xFFCBD5E1),
        disabledForegroundColor: _AppColors.muted,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        textStyle: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900),
      ),
      onPressed: enabled ? onPressed : null,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 38),
          const SizedBox(height: 10),
          Text(label),
        ],
      ),
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

class _PartyLogoBadge extends StatelessWidget {
  const _PartyLogoBadge({this.logoUrl, this.partido});

  final String? logoUrl;
  final String? partido;

  @override
  Widget build(BuildContext context) {
    if (logoUrl != null && logoUrl!.isNotEmpty) {
      return Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: Colors.white.withValues(alpha: 0.9),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(2),
            child: Image.network(
              logoUrl!,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => _PartyFallback(partido: partido),
            ),
          ),
        ),
      );
    }

    return _PartyFallback(partido: partido);
  }
}

class _PartyFallback extends StatelessWidget {
  const _PartyFallback({this.partido});

  final String? partido;

  @override
  Widget build(BuildContext context) {
    final sigla = (partido ?? '')
        .trim()
        .split(' ')
        .where((p) => p.isNotEmpty)
        .map((p) => p[0].toUpperCase())
        .take(2)
        .join();

    if (sigla.isNotEmpty) {
      return Container(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: Text(
          sigla,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 12,
          ),
        ),
      );
    }

    return const Icon(Icons.how_to_vote_rounded);
  }
}

class _AvatarActionIcon extends StatelessWidget {
  const _AvatarActionIcon({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.accent = _AppColors.navy,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          splashColor: accent.withValues(alpha: 0.14),
          highlightColor: accent.withValues(alpha: 0.08),
          child: Ink(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: accent.withValues(alpha: 0.28)),
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: accent.withValues(alpha: 0.12),
                  blurRadius: 12,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Icon(icon, color: accent, size: 22),
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
        color: _AppColors.blue,
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
      'NAO' => 'N\u00c3O',
      'ABSTENCAO' => 'ABSTEN\u00c7\u00c3O',
      _ => vote ?? '-',
    };

    return Card(
      color: _AppColors.green,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 56),
            const SizedBox(height: 12),
            const Text(
              'Voto registrado',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w900,
              ),
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
                      labelText: 'Buscar por pauta, sess\u00e3o ou id',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: periodo,
                    items: const [
                      DropdownMenuItem(value: 'todos', child: Text('Todo per\u00edodo')),
                      DropdownMenuItem(value: 'hoje', child: Text('Somente hoje')),
                      DropdownMenuItem(value: '7dias', child: Text('\u00daltimos 7 dias')),
                    ],
                    onChanged: (v) {
                      if (v != null) onPeriodoChanged(v);
                    },
                    decoration: const InputDecoration(
                      labelText: 'Per\u00edodo',
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
                        child: Text('Sess\u00e3o A-Z'),
                      ),
                    ],
                    onChanged: (v) {
                      if (v != null) onOrdenacaoChanged(v);
                    },
                    decoration: const InputDecoration(
                      labelText: 'Ordena\u00e7\u00e3o',
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
                    ? 'Nenhuma vota\u00e7\u00e3o encontrada para os filtros.'
                    : 'Nenhuma vota\u00e7\u00e3o nesta p\u00e1gina.',
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
                    labelText: 'Buscar por pauta, sess\u00e3o ou id',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: periodo,
                  items: const [
                    DropdownMenuItem(value: 'todos', child: Text('Todo per\u00edodo')),
                    DropdownMenuItem(value: 'hoje', child: Text('Somente hoje')),
                    DropdownMenuItem(value: '7dias', child: Text('\u00daltimos 7 dias')),
                  ],
                  onChanged: (v) {
                    if (v != null) onPeriodoChanged(v);
                  },
                  decoration: const InputDecoration(
                    labelText: 'Per\u00edodo',
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
                      child: Text('Sess\u00e3o A-Z'),
                    ),
                  ],
                  onChanged: (v) {
                    if (v != null) onOrdenacaoChanged(v);
                  },
                  decoration: const InputDecoration(
                    labelText: 'Ordena\u00e7\u00e3o',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
        ),
        ...historico.map((item) {
          final pauta = item['pautas'] as Map<String, dynamic>?;
          final titulo = pauta?['titulo']?.toString() ?? 'Sem t\u00edtulo';
          final sessao = pauta?['sessoes'] as Map<String, dynamic>?;
          final sessaoTitulo = sessao?['titulo']?.toString() ?? 'Sess\u00e3o sem t\u00edtulo';
          final encerradaEm = item['encerrada_em']?.toString() ?? '-';
          final id = item['id']?.toString() ?? '';

          return Card(
            child: ListTile(
              title: Text(titulo),
              subtitle: Text('Sess\u00e3o: $sessaoTitulo\nEncerrada: $encerradaEm'),
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
                    Text('P\u00e1gina $paginaAtual/$totalPaginas'),
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
              pauta?['titulo']?.toString() ?? 'Ata de vota\u00e7\u00e3o',
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
                _Badge(label: 'N\u00c3O', value: '${totais['nao'] ?? 0}'),
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
                  'Sess\u00f5es',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 10),
                if (sessoes.isEmpty)
                  const Text('Nenhuma sess\u00e3o encontrada.')
                else
                  ...sessoes.map((sessao) {
                    final id = sessao['id']?.toString() ?? '';
                    final titulo = sessao['titulo']?.toString() ?? 'Sem t\u00edtulo';
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
                          'Data: $data\nPautas: $totalPautas | Vota\u00e7\u00f5es: $totalVotacoes | Presen\u00e7as: $presencas',
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
            'Selecione uma sess\u00e3o para ver o detalhamento.',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    final titulo = sessaoDetalhe!['titulo']?.toString() ?? 'Sess\u00e3o';
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
              'Presen\u00e7as (${presencas.length})',
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
                          title: Text('Vota\u00e7\u00e3o ${votacao['status'] ?? '-'}'),
                          subtitle: Text(
                            'SIM ${totais['sim'] ?? 0} | N\u00c3O ${totais['nao'] ?? 0} | ABS ${totais['abstencao'] ?? 0} | TOTAL ${totais['total'] ?? 0}',
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




