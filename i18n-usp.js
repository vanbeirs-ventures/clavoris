/* ============================================================
   CLAVORIS — Why Clavoris page strings (all 10 languages)
   Hero · structural difference · the five reasons.
   Layered onto / overriding the base dictionaries.
   ============================================================ */
(function () {
  var L = window.I18N;
  function add(lang, obj) { if (L[lang]) Object.assign(L[lang], obj); }

  add("en", {
    why_eyebrow: "Bearer of keys",
    why_title: "One issuer group. One platform. {g}No friction between them.{/g}",
    why_lede: "Clavoris is the institutional-grade tokenisation platform that unlocks access to private capital instruments from partner issuers for qualifying professional investors, settled T+0 on the Canton Network.",
    why_sd_eyebrow: "The structural difference",
    why_sd_title: "A closed ecosystem, not a marketplace.",
    why_sd_p1: "Most tokenisation platforms are open marketplaces competing for issuers, or public-chain venues where every transaction is exposed to the network. Clavoris is neither.",
    why_sd_p2: "It distributes partner-issuer instruments — private bonds, company shares and fund share classes — across a network of regulated white-label operators. Issuers reach every operator through a single integration; operators reach every instrument through a single platform.",
    why_sd_pull: "A closed capital-markets ecosystem — not a marketplace.",
    why_v_eyebrow: "The five reasons", why_v_title: "Brand values, reframed as why.",
    why_v1_t: "Privacy by architecture", why_v1_b: "Canton's protocol-level privacy means holdings, transactions and counterparties are visible only to authorised parties. Not to the network. Not to Clavoris.",
    why_v2_t: "Operating inside the framework, not around it", why_v2_b: "CSSF oversight, MiFID II categorisation, AMLD6 KYC, AIFMD-compliant structures. These are the operating substrate, not a compliance afterthought.",
    why_v3_t: "Access in minutes, not weeks", why_v3_b: "Instruments historically locked behind intermediary gatekeepers become available the moment a partner issuer issues them — across every operator marketplace simultaneously.",
    why_v4_t: "Atomic settlement", why_v4_b: "Every Daml contract executes deterministically. Every DvP settlement completes in full or does not occur. T+0, no counterparty risk.",
    why_v5_t: "Built on the network institutions chose", why_v5_b: "Canton Network — the same infrastructure adopted by DTCC, Euroclear and Deutsche Börse. EURC settlement in MiCA-compliant euro, attested monthly."
  });

  add("nl", {
    why_eyebrow: "Drager van sleutels",
    why_title: "Eén uitgeversgroep. Eén platform. {g}Geen wrijving ertussen.{/g}",
    why_lede: "Clavoris is het tokenisatieplatform van institutionele kwaliteit dat toegang ontsluit tot private kapitaalinstrumenten van partneruitgevers voor gekwalificeerde professionele beleggers, afgewikkeld op T+0 op de Canton Network.",
    why_sd_eyebrow: "Het structurele verschil",
    why_sd_title: "Een gesloten ecosysteem, geen marktplaats.",
    why_sd_p1: "De meeste tokenisatieplatforms zijn open marktplaatsen die concurreren om uitgevers, of publieke-chain-omgevingen waar elke transactie zichtbaar is voor het netwerk. Clavoris is geen van beide.",
    why_sd_p2: "Het distribueert instrumenten van partneruitgevers — private obligaties, vennootschapsaandelen en fondsaandelenklassen — via een netwerk van gereguleerde white-label operatoren. Uitgevers bereiken elke operator via één integratie; operatoren bereiken elk instrument via één platform.",
    why_sd_pull: "Een gesloten kapitaalmarkt-ecosysteem — geen marktplaats.",
    why_v_eyebrow: "De vijf redenen", why_v_title: "Merkwaarden, geformuleerd als waarom.",
    why_v1_t: "Privacy door architectuur", why_v1_b: "De privacy op protocolniveau van Canton betekent dat posities, transacties en tegenpartijen alleen zichtbaar zijn voor geautoriseerde partijen. Niet voor het netwerk. Niet voor Clavoris.",
    why_v2_t: "Binnen het kader werken, niet eromheen", why_v2_b: "CSSF-toezicht, MiFID II-categorisatie, AMLD6-KYC, AIFMD-conforme structuren. Dit is het operationele fundament, geen compliance-bijzaak.",
    why_v3_t: "Toegang in minuten, niet weken", why_v3_b: "Instrumenten die historisch achter tussenpersonen verscholen bleven, worden beschikbaar zodra een partneruitgever ze uitgeeft — tegelijk op elke operatormarktplaats.",
    why_v4_t: "Atomische afwikkeling", why_v4_b: "Elk Daml-contract voert deterministisch uit. Elke DvP-afwikkeling voltooit volledig of vindt niet plaats. T+0, geen tegenpartijrisico.",
    why_v5_t: "Gebouwd op het netwerk dat instellingen kozen", why_v5_b: "Canton Network — dezelfde infrastructuur die DTCC, Euroclear en Deutsche Börse hanteren. EURC-afwikkeling in MiCA-conforme euro, maandelijks geattesteerd."
  });

  add("de", {
    why_eyebrow: "Träger der Schlüssel",
    why_title: "Eine Emittentengruppe. Eine Plattform. {g}Keine Reibung dazwischen.{/g}",
    why_lede: "Clavoris ist die Tokenisierungsplattform institutioneller Qualität, die qualifizierten professionellen Anlegern Zugang zu privaten Kapitalinstrumenten von Partner-Emittenten eröffnet — abgewickelt zu T+0 im Canton Network.",
    why_sd_eyebrow: "Der strukturelle Unterschied",
    why_sd_title: "Ein geschlossenes Ökosystem, kein Marktplatz.",
    why_sd_p1: "Die meisten Tokenisierungsplattformen sind offene Marktplätze, die um Emittenten konkurrieren, oder Public-Chain-Umgebungen, in denen jede Transaktion dem Netzwerk offenliegt. Clavoris ist keines von beidem.",
    why_sd_p2: "Sie vertreibt Instrumente von Partner-Emittenten — private Anleihen, Unternehmensanteile und Fondsanteilsklassen — über ein Netzwerk regulierter White-Label-Betreiber. Emittenten erreichen jeden Betreiber über eine einzige Integration; Betreiber erreichen jedes Instrument über eine einzige Plattform.",
    why_sd_pull: "Ein geschlossenes Kapitalmarkt-Ökosystem — kein Marktplatz.",
    why_v_eyebrow: "Die fünf Gründe", why_v_title: "Markenwerte, formuliert als Warum.",
    why_v1_t: "Datenschutz durch Architektur", why_v1_b: "Cantons Datenschutz auf Protokollebene bedeutet, dass Bestände, Transaktionen und Gegenparteien nur autorisierten Parteien sichtbar sind. Nicht dem Netzwerk. Nicht Clavoris.",
    why_v2_t: "Innerhalb des Rahmens arbeiten, nicht darum herum", why_v2_b: "CSSF-Aufsicht, MiFID-II-Kategorisierung, AMLD6-KYC, AIFMD-konforme Strukturen. Das ist das operative Fundament, kein Compliance-Nachgedanke.",
    why_v3_t: "Zugang in Minuten, nicht Wochen", why_v3_b: "Instrumente, die historisch hinter Intermediären verschlossen blieben, werden verfügbar, sobald ein Partner-Emittent sie begibt — gleichzeitig auf jedem Betreiber-Marktplatz.",
    why_v4_t: "Atomare Abwicklung", why_v4_b: "Jeder Daml-Vertrag wird deterministisch ausgeführt. Jede DvP-Abwicklung erfolgt vollständig oder gar nicht. T+0, kein Gegenparteirisiko.",
    why_v5_t: "Auf dem Netzwerk gebaut, das Institutionen wählten", why_v5_b: "Canton Network — dieselbe Infrastruktur, die DTCC, Euroclear und Deutsche Börse einsetzen. EURC-Abwicklung in MiCA-konformem Euro, monatlich attestiert."
  });

  add("fr", {
    why_eyebrow: "Porteur des clés",
    why_title: "Un groupe d'émetteurs. Une plateforme. {g}Aucune friction entre les deux.{/g}",
    why_lede: "Clavoris est la plateforme de tokenisation de qualité institutionnelle qui ouvre l'accès aux instruments de capital privé des émetteurs partenaires pour les investisseurs professionnels qualifiés, avec règlement T+0 sur le Canton Network.",
    why_sd_eyebrow: "La différence structurelle",
    why_sd_title: "Un écosystème fermé, non une place de marché.",
    why_sd_p1: "La plupart des plateformes de tokenisation sont des places de marché ouvertes qui se disputent les émetteurs, ou des environnements en chaîne publique où chaque transaction est exposée au réseau. Clavoris n'est ni l'un ni l'autre.",
    why_sd_p2: "Elle distribue les instruments des émetteurs partenaires — obligations privées, actions de sociétés et classes d'actions de fonds — via un réseau d'opérateurs régulés en marque blanche. Les émetteurs atteignent chaque opérateur par une seule intégration ; les opérateurs atteignent chaque instrument par une seule plateforme.",
    why_sd_pull: "Un écosystème de marchés de capitaux fermé — non une place de marché.",
    why_v_eyebrow: "Les cinq raisons", why_v_title: "Les valeurs de marque, reformulées en pourquoi.",
    why_v1_t: "Confidentialité par l'architecture", why_v1_b: "La confidentialité au niveau du protocole de Canton fait que les positions, les transactions et les contreparties ne sont visibles que des parties autorisées. Pas du réseau. Pas de Clavoris.",
    why_v2_t: "Opérer dans le cadre, non autour", why_v2_b: "Surveillance de la CSSF, catégorisation MiFID II, KYC AMLD6, structures conformes à l'AIFMD. C'est le socle opérationnel, non un ajout de conformité après coup.",
    why_v3_t: "Un accès en minutes, non en semaines", why_v3_b: "Les instruments historiquement verrouillés derrière des intermédiaires deviennent disponibles dès qu'un émetteur partenaire les émet — simultanément sur chaque place de marché d'opérateur.",
    why_v4_t: "Règlement atomique", why_v4_b: "Chaque contrat Daml s'exécute de manière déterministe. Chaque règlement DvP s'achève intégralement ou n'a pas lieu. T+0, sans risque de contrepartie.",
    why_v5_t: "Bâtie sur le réseau choisi par les institutions", why_v5_b: "Canton Network — la même infrastructure adoptée par DTCC, Euroclear et Deutsche Börse. Règlement EURC en euro conforme à MiCA, attesté chaque mois."
  });

  add("es", {
    why_eyebrow: "Portador de las llaves",
    why_title: "Un grupo emisor. Una plataforma. {g}Sin fricción entre ambos.{/g}",
    why_lede: "Clavoris es la plataforma de tokenización de grado institucional que abre el acceso a instrumentos de capital privado de emisores asociados para inversores profesionales cualificados, con liquidación T+0 en la Canton Network.",
    why_sd_eyebrow: "La diferencia estructural",
    why_sd_title: "Un ecosistema cerrado, no un mercado.",
    why_sd_p1: "La mayoría de las plataformas de tokenización son mercados abiertos que compiten por emisores, o entornos de cadena pública donde cada transacción queda expuesta a la red. Clavoris no es ninguno de los dos.",
    why_sd_p2: "Distribuye instrumentos de emisores asociados — bonos privados, acciones de empresas y clases de acciones de fondos — a través de una red de operadores regulados de marca blanca. Los emisores llegan a cada operador mediante una única integración; los operadores llegan a cada instrumento mediante una única plataforma.",
    why_sd_pull: "Un ecosistema cerrado de mercados de capitales — no un mercado.",
    why_v_eyebrow: "Las cinco razones", why_v_title: "Los valores de marca, reformulados como porqué.",
    why_v1_t: "Privacidad por arquitectura", why_v1_b: "La privacidad a nivel de protocolo de Canton significa que las posiciones, las transacciones y las contrapartes solo son visibles para las partes autorizadas. No para la red. No para Clavoris.",
    why_v2_t: "Operar dentro del marco, no a su alrededor", why_v2_b: "Supervisión de la CSSF, categorización MiFID II, KYC AMLD6, estructuras conformes a la AIFMD. Es el sustrato operativo, no un añadido de cumplimiento.",
    why_v3_t: "Acceso en minutos, no en semanas", why_v3_b: "Los instrumentos históricamente bloqueados tras intermediarios pasan a estar disponibles en cuanto un emisor asociado los emite — simultáneamente en cada mercado de operador.",
    why_v4_t: "Liquidación atómica", why_v4_b: "Cada contrato Daml se ejecuta de forma determinista. Cada liquidación DvP se completa por entero o no ocurre. T+0, sin riesgo de contraparte.",
    why_v5_t: "Construida sobre la red que eligieron las instituciones", why_v5_b: "Canton Network — la misma infraestructura adoptada por DTCC, Euroclear y Deutsche Börse. Liquidación en EURC en euro conforme a MiCA, atestiguada mensualmente."
  });

  add("ca", {
    why_eyebrow: "Portador de les claus",
    why_title: "Un grup emissor. Una plataforma. {g}Sense fricció entre tots dos.{/g}",
    why_lede: "Clavoris és la plataforma de tokenització de grau institucional que obre l'accés a instruments de capital privat d'emissors associats per a inversors professionals qualificats, amb liquidació T+0 a la Canton Network.",
    why_sd_eyebrow: "La diferència estructural",
    why_sd_title: "Un ecosistema tancat, no un mercat.",
    why_sd_p1: "La majoria de les plataformes de tokenització són mercats oberts que competeixen per emissors, o entorns de cadena pública on cada transacció queda exposada a la xarxa. Clavoris no és cap de les dues.",
    why_sd_p2: "Distribueix instruments d'emissors associats — bons privats, accions d'empreses i classes d'accions de fons — a través d'una xarxa d'operadors regulats de marca blanca. Els emissors arriben a cada operador mitjançant una única integració; els operadors arriben a cada instrument mitjançant una única plataforma.",
    why_sd_pull: "Un ecosistema tancat de mercats de capitals — no un mercat.",
    why_v_eyebrow: "Les cinc raons", why_v_title: "Els valors de marca, reformulats com a perquè.",
    why_v1_t: "Privacitat per arquitectura", why_v1_b: "La privacitat a nivell de protocol de Canton significa que les posicions, les transaccions i les contraparts només són visibles per a les parts autoritzades. No per a la xarxa. No per a Clavoris.",
    why_v2_t: "Operar dins el marc, no al seu voltant", why_v2_b: "Supervisió de la CSSF, categorització MiFID II, KYC AMLD6, estructures conformes a l'AIFMD. És el substrat operatiu, no un afegit de compliment.",
    why_v3_t: "Accés en minuts, no en setmanes", why_v3_b: "Els instruments històricament bloquejats darrere d'intermediaris passen a estar disponibles tan bon punt un emissor associat els emet — simultàniament a cada mercat d'operador.",
    why_v4_t: "Liquidació atòmica", why_v4_b: "Cada contracte Daml s'executa de manera determinista. Cada liquidació DvP es completa del tot o no es produeix. T+0, sense risc de contrapart.",
    why_v5_t: "Construïda sobre la xarxa que van triar les institucions", why_v5_b: "Canton Network — la mateixa infraestructura adoptada per DTCC, Euroclear i Deutsche Börse. Liquidació en EURC en euro conforme a MiCA, atestada mensualment."
  });

  add("it", {
    why_eyebrow: "Portatore delle chiavi",
    why_title: "Un gruppo emittente. Una piattaforma. {g}Nessun attrito tra i due.{/g}",
    why_lede: "Clavoris è la piattaforma di tokenizzazione di livello istituzionale che apre l'accesso a strumenti di capitale privato di emittenti partner per investitori professionali qualificati, con regolamento T+0 sulla Canton Network.",
    why_sd_eyebrow: "La differenza strutturale",
    why_sd_title: "Un ecosistema chiuso, non un marketplace.",
    why_sd_p1: "La maggior parte delle piattaforme di tokenizzazione sono marketplace aperti che competono per gli emittenti, o ambienti su catena pubblica in cui ogni transazione è esposta alla rete. Clavoris non è né l'uno né l'altro.",
    why_sd_p2: "Distribuisce strumenti di emittenti partner — obbligazioni private, azioni societarie e classi di azioni di fondi — attraverso una rete di operatori regolamentati white-label. Gli emittenti raggiungono ogni operatore con una sola integrazione; gli operatori raggiungono ogni strumento con una sola piattaforma.",
    why_sd_pull: "Un ecosistema chiuso dei mercati dei capitali — non un marketplace.",
    why_v_eyebrow: "Le cinque ragioni", why_v_title: "I valori del marchio, riformulati come perché.",
    why_v1_t: "Privacy per architettura", why_v1_b: "La privacy a livello di protocollo di Canton fa sì che posizioni, transazioni e controparti siano visibili solo alle parti autorizzate. Non alla rete. Non a Clavoris.",
    why_v2_t: "Operare dentro il quadro, non attorno", why_v2_b: "Vigilanza della CSSF, categorizzazione MiFID II, KYC AMLD6, strutture conformi all'AIFMD. È il substrato operativo, non un ripensamento sulla conformità.",
    why_v3_t: "Accesso in minuti, non settimane", why_v3_b: "Gli strumenti storicamente chiusi dietro agli intermediari diventano disponibili nel momento in cui un emittente partner li emette — simultaneamente su ogni marketplace degli operatori.",
    why_v4_t: "Regolamento atomico", why_v4_b: "Ogni contratto Daml si esegue in modo deterministico. Ogni regolamento DvP si completa per intero o non avviene. T+0, senza rischio di controparte.",
    why_v5_t: "Costruita sulla rete scelta dalle istituzioni", why_v5_b: "Canton Network — la stessa infrastruttura adottata da DTCC, Euroclear e Deutsche Börse. Regolamento in EURC in euro conforme a MiCA, attestato mensilmente."
  });

  add("pt", {
    why_eyebrow: "Portador das chaves",
    why_title: "Um grupo emitente. Uma plataforma. {g}Sem atrito entre ambos.{/g}",
    why_lede: "A Clavoris é a plataforma de tokenização de nível institucional que abre o acesso a instrumentos de capital privado de emitentes parceiros a investidores profissionais qualificados, com liquidação T+0 na Canton Network.",
    why_sd_eyebrow: "A diferença estrutural",
    why_sd_title: "Um ecossistema fechado, não um mercado.",
    why_sd_p1: "A maioria das plataformas de tokenização são mercados abertos que competem por emitentes, ou ambientes em cadeia pública onde cada transação fica exposta à rede. A Clavoris não é nenhum dos dois.",
    why_sd_p2: "Distribui instrumentos de emitentes parceiros — obrigações privadas, ações de empresas e classes de ações de fundos — através de uma rede de operadores regulados white-label. Os emitentes alcançam cada operador com uma única integração; os operadores alcançam cada instrumento com uma única plataforma.",
    why_sd_pull: "Um ecossistema fechado de mercados de capitais — não um mercado.",
    why_v_eyebrow: "As cinco razões", why_v_title: "Os valores da marca, reformulados como porquê.",
    why_v1_t: "Privacidade por arquitetura", why_v1_b: "A privacidade ao nível do protocolo da Canton significa que posições, transações e contrapartes só são visíveis para as partes autorizadas. Não para a rede. Não para a Clavoris.",
    why_v2_t: "Operar dentro do quadro, não à sua volta", why_v2_b: "Supervisão da CSSF, categorização MiFID II, KYC AMLD6, estruturas conformes à AIFMD. É o substrato operacional, não um acréscimo de conformidade.",
    why_v3_t: "Acesso em minutos, não em semanas", why_v3_b: "Os instrumentos historicamente fechados atrás de intermediários ficam disponíveis assim que um emitente parceiro os emite — em simultâneo em cada mercado de operador.",
    why_v4_t: "Liquidação atómica", why_v4_b: "Cada contrato Daml executa-se de forma determinista. Cada liquidação DvP conclui-se por inteiro ou não ocorre. T+0, sem risco de contraparte.",
    why_v5_t: "Construída sobre a rede que as instituições escolheram", why_v5_b: "Canton Network — a mesma infraestrutura adotada pela DTCC, Euroclear e Deutsche Börse. Liquidação em EURC em euro conforme a MiCA, atestada mensalmente."
  });

  add("ja", {
    why_eyebrow: "鍵を携える者",
    why_title: "一つの発行体グループ。一つのプラットフォーム。{g}その間に摩擦はない。{/g}",
    why_lede: "Clavorisは、適格なプロフェッショナル投資家に対し、パートナー発行体のプライベート資本商品へのアクセスを開く機関投資家水準のトークン化プラットフォームです。Canton Network上でT+0決済されます。",
    why_sd_eyebrow: "構造上の違い",
    why_sd_title: "マーケットプレイスではなく、閉じたエコシステム。",
    why_sd_p1: "ほとんどのトークン化プラットフォームは、発行体を奪い合うオープンなマーケットプレイスか、あらゆる取引がネットワークにさらされるパブリックチェーンの場です。Clavorisはそのいずれでもありません。",
    why_sd_p2: "パートナー発行体の商品（プライベート債、企業株式、ファンド株式クラス）を、規制対象のホワイトラベル運営者ネットワークを通じて流通させます。発行体は一度の接続であらゆる運営者に、運営者は一つのプラットフォームであらゆる商品に到達します。",
    why_sd_pull: "閉じた資本市場のエコシステム — マーケットプレイスではない。",
    why_v_eyebrow: "五つの理由", why_v_title: "ブランド価値を「なぜ」として捉え直す。",
    why_v1_t: "アーキテクチャによるプライバシー", why_v1_b: "Cantonのプロトコルレベルのプライバシーにより、保有、取引、取引相手は認可された当事者にのみ見えます。ネットワークには見えません。Clavorisにも見えません。",
    why_v2_t: "枠組みの外ではなく、内側で運営する", why_v2_b: "CSSFの監督、MiFID IIの分類、AMLD6のKYC、AIFMD準拠の仕組み。これらは運営の基盤であり、後付けのコンプライアンスではありません。",
    why_v3_t: "数週間ではなく、数分でのアクセス", why_v3_b: "従来は仲介者の背後に閉ざされていた商品が、パートナー発行体の発行と同時に、すべての運営者マーケットプレイスで利用可能になります。",
    why_v4_t: "アトミック決済", why_v4_b: "あらゆるDamlコントラクトは決定論的に実行されます。あらゆるDvP決済は全額完了するか、まったく行われないかです。T+0、取引相手リスクなし。",
    why_v5_t: "機関が選んだネットワーク上に構築", why_v5_b: "Canton Network — DTCC、Euroclear、Deutsche Börseが採用したのと同じインフラ。MiCA準拠のユーロによるEURC決済、毎月証明されます。"
  });

  add("zh", {
    why_eyebrow: "执钥之人",
    why_title: "一个发行人集团。一个平台。{g}两者之间毫无摩擦。{/g}",
    why_lede: "Clavoris 是机构级代币化平台，为合格的专业投资者开启合作发行人私募资本工具的准入，并在 Canton Network 上实现 T+0 结算。",
    why_sd_eyebrow: "结构性差异",
    why_sd_title: "一个封闭的生态系统,而非交易市场。",
    why_sd_p1: "大多数代币化平台要么是争夺发行人的开放交易市场,要么是每笔交易都暴露于网络的公链场所。Clavoris 两者皆非。",
    why_sd_p2: "平台通过受监管的白标运营者网络分销合作发行人的金融工具——私募债券、公司股权与基金份额类别。发行人一次接入即可触达所有运营者；运营者通过一个平台即可触达所有金融工具。",
    why_sd_pull: "一个封闭的资本市场生态系统——而非交易市场。",
    why_v_eyebrow: "五大理由", why_v_title: "品牌价值,以「为何」重新诠释。",
    why_v1_t: "架构即隐私", why_v1_b: "Canton 协议层级的隐私意味着持仓、交易与交易对手仅对获授权方可见。网络看不到。Clavoris 也看不到。",
    why_v2_t: "在框架之内运营,而非绕过它", why_v2_b: "CSSF 监管、MiFID II 分类、AMLD6 KYC、符合 AIFMD 的结构。这些是运营的基底,而非事后补加的合规。",
    why_v3_t: "以分钟计的访问,而非数周", why_v3_b: "以往被中介机构层层把持的金融工具，在合作发行人发行的瞬间即可获得——并同时出现在每一个运营者交易市场。",
    why_v4_t: "原子化结算", why_v4_b: "每一份 Daml 合约都确定性地执行。每一笔 DvP 结算要么全额完成,要么不发生。T+0,无对手方风险。",
    why_v5_t: "构建于机构所选的网络之上", why_v5_b: "Canton Network——与 DTCC、Euroclear 及 Deutsche Börse 所采用的相同基础设施。以符合 MiCA 的欧元进行 EURC 结算,每月获得鉴证。"
  });
})();
