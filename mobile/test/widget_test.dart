import 'package:flutter_test/flutter_test.dart';
import 'package:sistema_votacao_camara_mobile/main.dart';

void main() {
  testWidgets('inicia o app', (tester) async {
    await tester.pumpWidget(const CamaraVotacaoApp());
    await tester.pump();

    expect(find.byType(CamaraVotacaoApp), findsOneWidget);
  });
}
