# Guide scripts. Tags in [brackets] direct the voice (eleven_v4) and are stripped from captions.
# TTS_FIX maps caption spelling to what the voice should say.
import json, re, sys

SECTIONS = [
("intro", "Bienvenida a Yavaya", "/guia", """
[softly] Escucha… [pause] Es temprano en Centroamérica. Huele a café, la ciudad despierta… y alguien, en algún lugar, necesita algo.
Vender la bicicleta que ya no usa. Encontrar un plomero hoy mismo. Un trabajo que pague lo justo. Que le traigan la comida. Una palabra de aliento… o un perrito que le cambie la vida.
[warmly] Hola. Qué alegría tenerte aquí. [happy] Esto es Yavaya: el hogar digital de Centroamérica y México. Una sola cuenta, una sola reputación… y todo un mundo adentro.
[excited] En esta guía te llevo de la mano, distrito por distrito. Vamos a pasear por el Mercadito, Servicios y Trabajo. Nos subimos a YavayaGo, con sus viajes y mandados. Entramos a la Comunidad y al Espacio Violeta. Hacemos una pausa en el Santuario, conocemos a los peluditos de Animales… [laughs softly] y al final te cuento el secreto que lo sostiene todo: la confianza.
[warmly] ¿Lista? ¿Listo? [laughs softly] Vamos.
"""),
("mercadito", "Mercadito", "/mercadito", """
[warmly] Imagina a Carlos. Tiene una bicicleta casi nueva guardada en el patio… y le vendría muy bien ese dinerito. [happy] Carlos, bienvenido al Mercadito.
Aquí se compra y se vende de todo, en Centroamérica y México: vehículos, casas y terrenos, electrónica, moda, cosas del hogar, deportes y clasificados.
Publicar es gratis, hasta cinco publicaciones activas a la vez. [laughs softly] Sí, gratis. Subes tus fotos, escribes un título claro, eliges tu ciudad… y listo.
¿Y lo mejor? Antes de escribirle a un vendedor, ves su reputación. Nada de comprarle a ciegas a un desconocido. Cuando algo te gusta, le escribes directo por WhatsApp, y el pago es entre ustedes, en efectivo. Yavaya no toca tu dinero.
[curious] ¿Buscas algo que todavía no aparece? Guarda tu búsqueda, y Yavaya te avisa cuando llegue algo nuevo.
[softly] Y mientras tanto, te cuidamos: a cada foto le quitamos la ubicación y los datos de la cámara, una persona revisa cada publicación reportada, y las cuentas nuevas empiezan con pocas publicaciones, para frenar a quien quiera abusar.
[excited] ¿Quieres vender más rápido? Destaca tu publicación por siete días con tokens. Pero vender lo tuyo… sigue siendo gratis.
[warmly] Así que ya sabes: toca «Publicar», y que tu primera venta sea hoy.
"""),
("servicios", "Servicios", "/services", """
[softly] Son las tres de la mañana. Gotea el techo… plic… plic… plic. [laughs softly] ¿A quién llamas? [warmly] Para eso existe Servicios.
Aquí pides lo que necesitas, y te responden personas y profesionales cerca de ti, cada uno con su reputación a la vista. Hogar y reparaciones, limpieza y jardín, mecánica, tecnología, belleza, eventos, clases para los niños, trámites legales… y también salud, y salud mental.
[excited] ¿Es urgente? Marca «Lo necesito hoy». Tu pedido lo ven primero quienes dijeron que pueden ir hoy mismo.
Tú cuentas qué pasa, dónde y para cuándo. Recibes respuestas, comparas, y eliges por reputación, por reseñas y por trato, no solo por precio. Al terminar, dejas tu reseña, y así la siguiente persona elige mejor. Pedir y responder es gratis.
[softly] Algo muy importante: una psicóloga, un enfermero o una abogada solo aparecen con licencia verificada cuando una persona de Yavaya la revisó. Antes de eso, se ve clarito: «sin verificar». Nunca al revés.
Y como un pedido cuenta dónde vive alguien, los pedidos solo los ven los miembros.
[happy] ¿Tienes un oficio, una profesión, unas manos que hacen magia? Crea tu perfil y ofrece tus servicios. [warmly] Tu próximo cliente está más cerca de lo que crees.
"""),
("trabajo", "Trabajo", "/work", """
[warmly] Imagina a Sofía. Diseñadora, talentosa… y cansada de ofertas que no dicen cuánto pagan. O peor: que le piden dinero para aplicar. [softly] Sofía, esto es para ti.
[happy] Bienvenida a Trabajo: empleos y proyectos profesionales, en tu ciudad o a distancia. Aquí cada oferta dice cuánto paga. Siempre. Sin subastas y sin guerras de precios: postulas con tu perfil y un mensaje, y quien publica decide.
[excited] Postular es siempre gratis. Y una regla de oro: un trabajo de verdad nunca te cobra por aplicar, ni por capacitación, ni por materiales. Si alguien te pide dinero, repórtalo.
Del otro lado, una persona de Yavaya revisa a cada empleador antes de su primera oferta, y una empresa publica siempre con su nombre verificado. Nada de ofertas anónimas.
Tecnología, diseño, marketing, redacción, finanzas, ventas, construcción, salud, turismo, agricultura, transporte… hay lugar para cada profesión.
[warmly] Crea tu perfil profesional, muestra tu portafolio, y deja que tu trabajo hable por ti. ¿Contratas? Publica hasta dos ofertas abiertas, gratis.
[happy] Porque aquí no gana quien cobra menos. [laughs softly] Gana quien trabaja mejor.
"""),
("yavayago", "YavayaGo", "/yavayago", """
[happy] ¿Hambre? [laughs softly] ¿Se acabó el pan, o hace falta algo de la farmacia? Esto es YavayaGo: lo que necesitas, traído por alguien de confianza.
Comida, súper, farmacia, panadería, bebidas y los negocios de tu barrio, en un solo lugar. Eliges tu ciudad, entras a un negocio, armas tu pedido… y listo.
[warmly] Cada repartidor fue revisado por una persona de Yavaya: su identidad, su foto, su vehículo y su teléfono, antes de su primera entrega. Y mientras esperas, ves en el mapa, en vivo, quién trae tu pedido: su nombre, su cara, su vehículo y su placa.
Pagas al recibir, en efectivo, el precio que puso el negocio. Yavaya no cobra comisión. ¿Y si el pedido es para otra persona? También se puede: lo pides tú, y quien lo recibe paga al llegar.
[excited] Pero espera… que hay más: Viajes y mandados. Un viaje, un paquete, un mandado, o una mano con algo. Tú dices cuánto pagas. Los conductores cercanos aceptan tu precio o te ofrecen el suyo, con su foto, su vehículo y su placa… y tú eliges. Lo sigues en el mapa, y puedes compartir tu viaje con alguien de confianza. Todo lo que pagas es para el conductor. [happy] Empezamos en Managua.
¿Tienes un negocio? Ábrelo en YavayaGo. ¿Tienes moto o carro? Reparte con nosotros. [warmly] Lo local, a tu puerta.
"""),
("comunidad", "Comunidad", "/community", """
[softly] Hay días que pesan. Y hay días en que tú tienes justo lo que otra persona necesita. [warmly] Para los dos existe la Comunidad.
Esta es la plaza de Yavaya: un lugar tranquilo para pedir una mano, ofrecerla, o compartir lo que llevas por dentro. Aquí no se cobra. Aquí se viene a sumar.
Ayuda local, para lo que se resuelve entre vecinos. Y apoyo familiar, para los momentos difíciles de una familia, con respeto y discreción: puedes publicar sin mostrar tu nombre.
[softly] La plaza es solo para miembros, porque muchas publicaciones hablan de momentos difíciles, y no deben quedar a la vista de todos.
[warmly] Las reglas se ven y se cumplen: aquí no tienen lugar el acoso, las estafas, el abuso, las peleas políticas, el extremismo ni el spam. Y la necesidad de una persona nunca se convierte en espectáculo.
Cuando alguien te responde o te apoya, te llega un aviso. Así nadie se queda hablando solo.
[happy] Desde la plaza también se entra al Santuario y al Espacio Violeta. [warmly] Entra, saluda, y descubre lo bonito que es tener vecinos de verdad.
"""),
("violeta", "Espacio Violeta", "/violeta", """
[softly] Este video es para ti, mujer. Para la que está pasando por algo difícil, y no sabe con quién hablar.
Una pareja que te engañó, o te dejó. Un embarazo que enfrentas sola. Maltrato. Ansiedad. Una tristeza que no se va. [warmly] No tienes que cargarlo sola.
Este es el Espacio Violeta: un lugar protegido, solo para mujeres, dentro de Yavaya. Y es gratis.
Aquí recibes un nombre que solo existe en este espacio, como «Luna 27». Nunca se muestra tu nombre de Yavaya. Todo lo que escribes se guarda cifrado, y nadie del equipo tiene una pantalla para leerlo. Una conversación privada es solo de dos. Y nada de aquí llega a tus avisos ni a tu correo.
Los mensajes de la sala se borran solos a los 30 días, y los privados a los 90. Puedes borrar los tuyos cuando quieras. Y si necesitas salir rápido, un botón te saca al instante… o presionas Escape dos veces.
[warmly] Aquí también te escuchan profesionales de psicología y psiquiatría, con licencia verificada.
[softly] Y te decimos la verdad: el cifrado no es de extremo a extremo, y no podemos comprobar que cada persona sea mujer; quien mienta, es expulsada. Si estás en peligro ahora mismo, busca un lugar seguro y llama a emergencias.
[warmly] Aquí, nadie está sola.
"""),
("santuario", "Santuario", "/sanctuary", """
[softly] Ocho de la mañana. Abres los ojos… y te espera una luz. [warmly] Bienvenida, bienvenido al Santuario: el distrito de la fe.
Cada mañana, a las 8, llega «La luz de hoy»: una oración, un refrán, una frase o una bendición. Es de Yavaya para todos, crean en lo que crean, y hay una nueva para cada día del año. [happy] Y tú eliges qué quieres recibir. ¿Solo oraciones? ¿Solo refranes? Marcas tus casillas… y listo.
Aquí también están las iglesias, y cada una fue revisada por una persona de Yavaya antes de aparecer. Busca la tuya, síguela, y verás sus horarios y la palabra que comparte cada día. Esas palabras no las escribe Yavaya: cada una la firma su iglesia.
¿Guías una congregación? Registrar tu iglesia es gratis, y lo hace su pastor, su sacerdote o su responsable.
[softly] Y cuando el corazón pesa, está el muro de oración. Compartes tu petición, incluso sin mostrar tu nombre, y otros oran contigo.
[warmly] Porque a veces, lo que más necesitamos… es saber que alguien está orando por nosotros. Pasa. Aquí siempre hay un lugar para ti.
"""),
("animales", "Animales", "/animals", """
[happy] Mira esa carita. [laughs softly] ¿Cómo no enamorarse? Bienvenida, bienvenido a Animales, donde cada animal merece un hogar seguro.
Aquí adoptar no es un clic. Es un camino… y es precioso. Primero aprendes: una guía de cuidado responsable, sobre alimentación, vacunas, esterilización, espacio y trato, con su prueba. Al aprobarla, recibes tu certificado.
Después, adoptas: animales rescatados que buscan familia, sin precio, con una solicitud completa. Quién eres, cómo es tu hogar, si tienes otros animales. Y quien lo rescató elige el hogar. [warmly] Al mes, Yavaya les recuerda saludarse, para saber cómo está.
¿Rescatas animales? Solicita ser rescatista verificado, y publica a los tuyos para que encuentren familia.
[softly] ¿Se perdió tu animal, o encontraste uno? Publícalo en Perdidos y encontrados, y te avisamos si aparece una coincidencia.
Y si ves maltrato, avisa a las autoridades y a una organización de rescate. Si está en una publicación de Yavaya, repórtala.
[warmly] Todo esto es gratis, porque proteger una vida nunca debería costar. [happy] Anda… que alguien te está esperando, moviendo la colita.
"""),
("confianza", "Confianza y tokens", "/trust", """
[warmly] Ahora sí… el secreto. [laughs softly] Debajo de cada distrito hay algo que no se ve, pero se siente: la confianza.
En Yavaya, una persona es una cuenta. Tu identidad es única y permanente, con un número de 8 dígitos que es solo tuyo. Nadie puede empezar de cero después de estafar.
Tu reputación se gana con hechos: una venta cumplida, una entrega, un trabajo bien hecho, una reseña útil. Va de 0 a 1000, premia la constancia, no la popularidad… y te acompaña a todos los distritos.
Las cuentas nuevas pasan por un período de supervisión reforzada, y cada acción importante queda en un registro que nadie puede borrar.
[happy] ¿Y los tokens? Son créditos para participar, nada más. No son criptomoneda, ni una inversión. Publicar es gratis; los tokens sirven para destacar, o para tener más publicaciones. Recibes tokens de bienvenida en tu primera semana, y más cuando invitas a tus amigos. Y si quieres, los compras desde menos de un dólar.
[warmly] Y una promesa: sin cifras inventadas, sin usuarios falsos, sin reseñas falsas. En la página Estado te decimos qué funciona hoy… y qué todavía no.
Además, tú eliges tu idioma, tu tema claro u oscuro, y qué tan precisa se muestra tu ubicación. [happy] Aquí, tú mandas.
"""),
("cierre", "Bienvenida a casa", "/guia", """
[warmly] Y así es Yavaya. Un mercado, un oficio, un trabajo, un mandado, una mano amiga, una oración… y un hogar para quien lo necesita. Todo con una sola cuenta, y con gente de confianza.
[happy] Crear tu cuenta es gratis. Entra a yavaya.lat, elige tu distrito… [laughs softly] y empieza a vivirlo.
[softly] Porque aquí, nadie está solo. [warmly] Bienvenida, bienvenido… a casa.
"""),
]

TTS_FIX = [("YavayaGo", "Yavaya Go"), ("yavaya.lat", "yavaya punto lat")]

def tts(text):
    t = " ".join(l.strip() for l in text.strip().splitlines() if l.strip())
    for a, b in TTS_FIX:
        t = t.replace(a, b)
    return t

def caption(text):
    t = re.sub(r"\[[^\]]+\]\s*", "", text.strip())
    return [l.strip() for l in t.splitlines() if l.strip()]

if __name__ == "__main__":
    out = []
    for key, title, page, text in SECTIONS:
        out.append({"key": key, "title": title, "page": page, "tts": tts(text), "caption": caption(text)})
    json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
    tot = 0
    for s in out:
        n = len(s["tts"]); tot += n
        print(f'{s["key"]:10} {n:5} chars  ~{n/15:.0f}s')
    print("total", tot)
