# The edit: for every section, which picture is on screen when the narrator says what.
# A shot is (anchor phrase, source). Sources: an image id ("m1" = first variation, "m1b" = second)
# or "ui:<capture>" for a real screen of yavaya.lat framed in a browser window.
# Callouts are short on-screen facts, each taken from the live site, shown when the phrase is said.

ORDER = ["intro", "mercadito", "servicios", "trabajo", "yavayago", "comunidad", "violeta", "santuario", "animales", "confianza", "cierre"]

SECTIONS = {
 "intro": {
  "title": None, "num": None, "tagline": None, "path": "/guia", "bg": "i1",
  "min_shot": 1.6,
  "shots": [
   ("", "i1"), ("Huele a café", "i2"), ("la ciudad despierta", "i3"), ("Vender la bicicleta", "m1"),
   ("Encontrar un plomero", "s2"), ("Un trabajo que pague", "t1"), ("Que le traigan", "g3"),
   ("Una palabra de aliento", "c2"), ("o un perrito", "a1"), ("Hola", "i4"), ("Esto es Yavaya", "ui:home"),
   ("En esta guía", "i5"), ("Hacemos una pausa", "i6"), ("y al final te cuento", "i7"), ("Lista", "i1b"),
  ],
  "callouts": [],
 },
 "mercadito": {
  "title": "Mercadito", "num": "01", "tagline": "Compra y vende cualquier cosa, con seguridad.", "path": "/mercadito", "bg": "m2",
  "min_shot": 1.8,
  "shots": [
   ("", "m1"), ("bienvenido al Mercadito", "ui:mercadito"), ("Aquí se compra", "m3"), ("vehículos", "m6"),
   ("casas y terrenos", "m8"), ("electrónica", "m9"), ("moda", "m7"), ("Publicar es gratis", "m1b"),
   ("Subes tus fotos", "m7b"), ("Antes de escribirle", "ui:mercadito-about"), ("le escribes directo", "m5"),
   ("el pago es entre ustedes", "m4"), ("Guarda tu búsqueda", "m10"), ("te cuidamos", "m3b"),
   ("Quieres vender más rápido", "m2"), ("Así que ya sabes", "m4b"),
  ],
  "callouts": [
   ("Publicar es gratis", "Publicar es gratis · hasta 5 publicaciones activas"),
   ("ves su reputación", "La reputación del vendedor, antes de escribirle"),
   ("el pago es entre ustedes", "El pago es entre ustedes, en efectivo"),
   ("Guarda tu búsqueda", "Búsquedas guardadas: te avisamos si llega algo nuevo"),
   ("a cada foto le quitamos", "Cada foto, sin ubicación ni datos de la cámara"),
   ("Destaca tu publicación", "Destacar: 7 días, con tokens"),
  ],
 },
 "servicios": {
  "title": "Servicios", "num": "02", "tagline": "Alguien de confianza para lo que necesitas, también hoy mismo.", "path": "/services", "bg": "s2",
  "min_shot": 1.8,
  "shots": [
   ("", "s1"), ("Para eso existe Servicios", "s2"), ("Aquí pides", "ui:services"), ("limpieza y jardín", "s10"),
   ("mecánica", "s6"), ("belleza", "s3"), ("eventos", "s9"), ("clases para los niños", "s8"), ("y también salud", "s5"),
   ("y salud mental", "s4"), ("Es urgente", "ui:services-new"), ("Tu pedido lo ven primero", "s7"),
   ("Tú cuentas qué pasa", "ui:services-about"), ("Recibes respuestas", "s2b"), ("Algo muy importante", "s4b"),
   ("Y como un pedido", "s5b"), ("Tienes un oficio", "s3b"), ("Tu próximo cliente", "s10b"),
  ],
  "callouts": [
   ("Marca «Lo necesito hoy»", "«Lo necesito hoy»: primero lo ven quienes pueden ir hoy"),
   ("Pedir y responder es gratis", "Pedir y responder es gratis"),
   ("solo aparecen con licencia verificada", "Licencias revisadas por una persona de Yavaya"),
   ("los pedidos solo los ven", "Los pedidos solo los ven los miembros"),
  ],
 },
 "trabajo": {
  "title": "Trabajo", "num": "03", "tagline": "Empleos y proyectos profesionales. Sin subastas.", "path": "/work", "bg": "t1",
  "min_shot": 1.8,
  "shots": [
   ("", "t1"), ("O peor", "t8"), ("Bienvenida a Trabajo", "ui:work"), ("o a distancia", "t4"),
   ("Aquí cada oferta", "ui:work-principles"), ("postulas con tu perfil", "t2"), ("Postular es siempre gratis", "t1b"),
   ("Si alguien te pide dinero", "t8b"), ("Del otro lado", "t9"), ("Tecnología", "t3"), ("salud", "t6"),
   ("agricultura", "t5"), ("hay lugar para cada profesión", "t7"), ("Crea tu perfil profesional", "t4b"),
   ("Contratas", "t9b"), ("Porque aquí no gana", "t2b"),
  ],
  "callouts": [
   ("Aquí cada oferta dice", "Cada oferta dice cuánto paga"),
   ("Postular es siempre gratis", "Postular es siempre gratis"),
   ("una persona de Yavaya revisa", "Cada empleador, revisado por una persona"),
   ("Publica hasta dos ofertas", "Hasta 2 ofertas abiertas, gratis"),
  ],
 },
 "yavayago": {
  "title": "YavayaGo", "num": "04", "tagline": "Entregas, viajes y mandados. Rápido, cercano, confiable.", "path": "/yavayago", "bg": "g1",
  "min_shot": 1.8,
  "shots": [
   ("", "g2"), ("Se acabó el pan", "g9"), ("algo de la farmacia", "g5"), ("Esto es Yavaya Go", "ui:yavayago"),
   ("Comida, súper", "g1"), ("Cada repartidor", "ui:yavayago-trust"), ("ves en el mapa", "g4"), ("Pagas al recibir", "g3"),
   ("Y si el pedido es para otra persona", "g12"), ("quien lo recibe paga", "g10"), ("Pero espera", "ui:viajes"),
   ("Un viaje", "g6"), ("un mandado", "g7"), ("o una mano con algo", "g8"), ("Tú dices cuánto pagas", "ui:viajes-how"),
   ("y tú eliges", "g11"), ("Lo sigues en el mapa", "g4b"), ("Todo lo que pagas", "g6b"), ("Empezamos en Managua", "g11b"),
   ("Tienes un negocio", "g2b"), ("Tienes moto o carro", "g1b"), ("Lo local, a tu puerta", "g10b"),
  ],
  "callouts": [
   ("Cada repartidor fue revisado", "Repartidores revisados por una persona"),
   ("ves en el mapa", "En vivo en el mapa: nombre, cara, vehículo y placa"),
   ("Pagas al recibir", "Pagas al recibir · Yavaya no cobra comisión"),
   ("Tú dices cuánto pagas", "Viajes y mandados: tú propones el precio"),
   ("puedes compartir tu viaje", "Comparte tu viaje con alguien de confianza"),
   ("Empezamos en Managua", "Empezamos en Managua"),
  ],
 },
 "comunidad": {
  "title": "Comunidad", "num": "05", "tagline": "Vecinos que se ayudan, sin cobrar.", "path": "/community", "bg": "c1",
  "min_shot": 2.0,
  "shots": [
   ("", "c4"), ("Y hay días en que tú tienes", "c5"), ("Para los dos existe", "ui:community-about"), ("Esta es la plaza", "c1"),
   ("Aquí no se cobra", "c3"), ("Ayuda local", "c8"), ("Y apoyo familiar", "c4b"), ("puedes publicar sin mostrar", "ui:community-new"),
   ("La plaza es solo para miembros", "c6"), ("Las reglas se ven", "c2"), ("Cuando alguien te responde", "c9"),
   ("Desde la plaza también", "c7"), ("Entra, saluda", "c1b"),
  ],
  "callouts": [
   ("Aquí no se cobra", "Aquí no se cobra: se viene a sumar"),
   ("puedes publicar sin mostrar", "Puedes publicar sin mostrar tu nombre"),
   ("La plaza es solo para miembros", "La plaza es solo para miembros"),
   ("Las reglas se ven", "Moderación visible"),
  ],
 },
 "violeta": {
  "title": "Espacio Violeta", "num": "06", "tagline": "Un lugar protegido, solo para mujeres.", "path": "/violeta", "bg": "v2",
  "min_shot": 2.2, "xfade": 1.0,
  "shots": [
   ("", "v1"), ("Una pareja que te engañó", "v3"), ("Un embarazo", "v6"), ("Maltrato", "v1b"), ("No tienes que cargarlo", "v4"),
   ("Este es el Espacio Violeta", "v2"), ("Y es gratis", "ui:violeta"), ("Aquí recibes un nombre", "v3b"),
   ("Todo lo que escribes", "ui:violeta-protect"), ("Una conversación privada", "v4b"), ("Los mensajes de la sala", "v8"),
   ("si necesitas salir rápido", "v2b"), ("Aquí también te escuchan", "v7"), ("Y te decimos la verdad", "v7b"),
   ("Si estás en peligro", "v6b"), ("Aquí, nadie está sola", "v5"),
  ],
  "callouts": [
   ("Y es gratis", "Solo para mujeres · gratis"),
   ("Aquí recibes un nombre", "Un nombre solo de aquí, como «Luna 27»"),
   ("se guarda cifrado", "Mensajes cifrados"),
   ("Los mensajes de la sala", "Se borra solo: la sala a los 30 días, lo privado a los 90"),
   ("si necesitas salir rápido", "Salida rápida: un botón, o Esc dos veces"),
   ("Aquí también te escuchan", "Profesionales con licencia verificada"),
  ],
 },
 "santuario": {
  "title": "Santuario", "num": "07", "tagline": "Tu iglesia, la palabra del día y la oración.", "path": "/sanctuary", "bg": "sa1",
  "min_shot": 2.0, "xfade": 0.9,
  "shots": [
   ("", "sa8"), ("te espera una luz", "sa1"), ("Bienvenida, bienvenido al Santuario", "sa2"), ("Cada mañana", "ui:sanctuary-light"),
   ("una oración, un refrán", "sa9"), ("crean en lo que crean", "sa6"), ("Y tú eliges", "ui:sanctuary-light"),
   ("Aquí también están las iglesias", "sa10"), ("Busca la tuya", "sa3"), ("verás sus horarios", "sa4"),
   ("Guías una congregación", "sa2b"), ("Y cuando el corazón pesa", "sa5"), ("y otros oran contigo", "sa7"),
   ("Porque a veces", "sa1b"), ("Pasa", "sa8b"),
  ],
  "callouts": [
   ("Cada mañana, a las 8", "La luz de hoy · cada mañana a las 8"),
   ("hay una nueva para cada día", "Una nueva para cada día del año"),
   ("Y tú eliges", "Tú eliges: oraciones, refranes, frases o bendiciones"),
   ("fue revisada por una persona", "Cada iglesia, revisada por una persona"),
   ("Registrar tu iglesia es gratis", "Registrar tu iglesia es gratis"),
   ("está el muro de oración", "El muro de oración: otros oran contigo"),
  ],
 },
 "animales": {
  "title": "Animales", "num": "08", "tagline": "Protección, educación y adopción responsable.", "path": "/animals", "bg": "a3",
  "min_shot": 1.8,
  "shots": [
   ("", "a1"), ("Cómo no enamorarse", "a1b"), ("Bienvenida, bienvenido a Animales", "ui:animals"), ("Primero aprendes", "a5"),
   ("con su prueba", "ui:animals-learn"), ("Después, adoptas", "a2"), ("Y quien lo rescató elige", "a3"), ("Al mes", "a8"),
   ("Rescatas animales", "a2b"), ("y publica a los tuyos", "a9"), ("Se perdió tu animal", "a6"),
   ("Publícalo en Perdidos", "ui:animals-lost"), ("Y si ves maltrato", "a4"), ("Todo esto es gratis", "a3b"), ("Anda", "a10"),
  ],
  "callouts": [
   ("Aquí adoptar no es un clic", "Aprende · Adopta · Rescata"),
   ("recibes tu certificado", "Certificado de cuidado responsable"),
   ("sin precio", "Sin precio · quien rescató elige el hogar"),
   ("Al mes", "Seguimiento al mes de la adopción"),
   ("Publícalo en Perdidos", "Perdidos y encontrados: te avisamos si hay coincidencia"),
   ("Todo esto es gratis", "Todo en Animales es gratis"),
  ],
 },
 "confianza": {
  "title": "Confianza", "num": "09", "tagline": "Una persona, una cuenta. La reputación se gana.", "path": "/trust", "bg": "cf2",
  "min_shot": 1.8,
  "shots": [
   ("", "cf2"), ("Debajo de cada distrito", "cf1"), ("una persona es una cuenta", "cf7"), ("Tu identidad es única", "ui:trust"),
   ("Tu reputación se gana", "cf3"), ("Va de 0 a 1000", "ui:reputation"), ("Las cuentas nuevas", "cf5"),
   ("Y los tokens", "ui:tokens"), ("Recibes tokens de bienvenida", "cf6"), ("Y una promesa", "ui:status"),
   ("Además, tú eliges", "cf4"), ("Aquí, tú mandas", "cf3b"),
  ],
  "callouts": [
   ("una persona es una cuenta", "Una persona, una cuenta"),
   ("Va de 0 a 1000", "Reputación de 0 a 1000, en todos los distritos"),
   ("No son criptomoneda", "Tokens: opcionales, no son criptomoneda"),
   ("Recibes tokens de bienvenida", "Tokens de bienvenida en tu primera semana"),
   ("Y una promesa", "Sin cifras inventadas · página Estado"),
  ],
 },
 "cierre": {
  "title": None, "num": None, "tagline": None, "path": "/guia", "bg": "e1",
  "min_shot": 0.9,
  "shots": [
   ("", "e1"), ("Un mercado", "m2"), ("un oficio", "s6"), ("un trabajo", "t2"), ("un mandado", "g1"), ("una mano amiga", "c2"),
   ("una oración", "sa3"), ("y un hogar", "a3"), ("Todo con una sola cuenta", "cf3"), ("Crear tu cuenta es gratis", "e4"),
   ("Entra a", "ui:home"), ("Porque aquí", "e2"), ("Bienvenida, bienvenido", "e3"),
  ],
  "callouts": [],
 },
}
