FIJA NORMA QUE ESTABLECE LAS CARACTERISTICAS FUNCIONALES Y ESPECIFICACIONES MINIMAS QUE DEBEN CUMPLIR LOS MEDIDORES DE CONSUMO TELEFONICO

Santiago, 24 de septiembre de 1999.- Con esta fecha se ha resuelto lo que sigue:

Núm. 1.346 exenta.- Vistos:

a) El decreto ley Nº 1.762, de 1977, que creó la Subsecretaría de Telecomunicaciones;

b) La ley Nº 18.168, de 1982, Ley General de Telecomunicaciones;

c) El artículo 2º de la ley Nº 19.302, de 1994;

d) El decreto supremo Nº 220, de 1980, del Ministerio de Transportes y Telecomunicaciones, que aprobó el Reglamento de Homologación de Aparatos Telefónicos;

e) El decreto supremo Nº 50, de 1988, del Ministerio de Transportes y Telecomunicaciones, que aprobó el Plan Técnico Fundamental de Señalización Telefónica;

f) El decreto supremo Nº 425, de 1996, del Ministerio de Transportes y Telecomunicaciones, que aprobó el Reglamento del Servicio Público Telefónico;

g) El decreto supremo Nº 556, de 1997, del Ministerio de Transportes y Telecomunicaciones, que aprobó el Reglamento sobre Tramitación y Resolución de Reclamos de Servicios de Telecomunicaciones;

h) La resolución exenta Nº 188, de 1999, de la Subsecretaría de Telecomunicaciones, que estableció el segundo como unidad de medición y registro de tráfico en la red pública telefónica; y

i) La resolución Nº 55, de 1992, cuyo texto refundido, coordinado y sistematizado fue fijado por la resolución Nº 520, de 1996, ambas de la Contraloría General de la República,

Considerando:

a) Que de conformidad a lo establecido por el artículo 2º de la ley Nº 19.302, de 1994, las empresas concesionarias de servicio público telefónico deben ofrecer facilidades que permitan, a solicitud del suscriptor y a sus expensas, verificar en su propio domicilio, las llamadas cursadas por intermedio de sus instalaciones;

b) Que, asimismo, el artículo 38º del Reglamento del Servicio Público Telefónico especifica que la compañía telefónica local debe ofrecer facilidades a través de la línea telefónica que permitan al suscriptor local, a solicitud y a expensas de éste, verificar el consumo realizado, mediante un medidor conectado a la instalación telefónica interior, el que podrá ser provisto por la compañía telefónica local o por terceros; y

c) Que corresponde a la Subsecretaría de Telecomunicaciones fijar, considerando la tecnología vigente, los elementos mínimos que la señalada verificación del consumo debe incorporar,

R e s u e l v o:

Fíjase la siguiente norma que establece las características funcionales y especificaciones mínimas que deben cumplir los medidores de consumo telefónico utilizados en una línea telefónica analógica de suscriptor local, en adelante la línea telefónica.

## Título I

De la terminología

#### Artículo 1º

Para los efectos de la presente norma se entenderá por:

a) Medidor de consumo telefónico: en adelante MCT, accesorio telefónico cuyas funciones son detectar, medir la duración, registrar y generar reportes de toda llamada telefónica completada que se realice desde las dependencias del suscriptor local del servicio telefónico. Además, deberá registrar y generar reportes de las comunicaciones que establezca el suscriptor con el centro de conmutación local, para programar servicios, tales como, candado electrónico, desvío de llamadas, etc.

b) Temporizador de consumo: bloque funcional del MCT, destinado a registrar la duración de la llamada telefónica.

c) Reporte escrito: documento generado por el MCT, que contiene los registros de consumo telefónico, llamada por llamada, realizadas entre dos fechas y horas específicas.

d) Validación del reporte escrito: valor hexadecimal que se imprime al final de un reporte (validación vertical). Este valor se obtiene, primero, para cada llamada al aplicar a los caracteres impresos anteriores a la validación de la llamada (validación horizontal), lo dispuesto en el punto 2.2.7 de la Recomendación X.25 del libro azul del CCITT, y, segundo, al aplicar el código cíclico especificado a los caracteres impresos obtenidos en el campo de validación de cada llamada.

e) Visor: elemento del MCT que permite al suscriptor verificar su consumo telefónico directamente desde este accesorio.

f) Indicadores de funcionamiento: elementos visibles o sonoros que señalan al usuario telefónico el estado en que se encuentra el MCT.

g) Sistema de impresión: sistema conformado por una impresora incorporada al MCT o por una o más interfaces de salida que permitan conectar una impresora externa. Estas interfaces deben ser sólo de salida, exceptuando las señales que envía la impresora al MCT para el control de la impresión.

En ningún caso el uso de estas interfaces permitirá modificar la información almacenada.

h) Eventos anómalos: se refiere a las siguientes situaciones:

- Falta de energía eléctrica de alimentación del MCT que impida su correcto funcionamiento, y su reposición.

- Ausencia de voltaje en la línea telefónica.

i) Centro de conmutación local: instalación de la compañía telefónica cuya función es realizar la conexión entre sí de los suscriptores que de él dependen y, con otros centros, a través de los cuales se alcanzan otros suscriptores no pertenecientes a dicho centro.

## Título II

De las especificaciones

A. Aspectos Globales del MCT

#### Artículo 2º

Estará formado por el conjunto de elementos de software y hardware con características mecánicas, eléctricas y funcionales que permita registrar el consumo del servicio telefónico del suscriptor local y los eventos anómalos.

#### Artículo 3º

Deberá actuar como una interfaz transparente para todas las señales que transiten por la línea telefónica, sin alterar el comportamiento de ésta ni las funciones del equipo telefónico.

#### Artículo 4º

Sólo deberá registrar aquellas señales necesarias para cumplir con su funcionamiento y objetivo. Una vez establecida la llamada, no deberá registrar información de marcación.

En particular, no deberá registrar información tal como claves de acceso, transferencia electrónica de fondos, etc. En caso que el MCT detecte una apertura calibrada, deberá registrar la información digitada por el suscriptor hasta la siguiente reversión de polaridad.

#### Artículo 5º

El o los temporizadores de consumo deberán permitir la medición al segundo. El error máximo aceptado para el reloj interno será de 1 segundo al día.

#### Artículo 6º

El reporte escrito deberá constar, por lo menos, con la siguiente información:

Encabezado:

- Número de homologación del MCT.

- Número telefónico asociado al MCT.

- Fecha y hora de la emisión del reporte.

Detalle o líneas del reporte:

a) Llamadas completadas:

- Fecha de inicio.

- Hora de inicio.

- Todos los dígitos marcados entre la apertura de la línea y la reversión de polaridad. Esto incluirá, además del número de destino, prefijo de acceso, indicativo de país, indicativo de portador y código de área cuando corresponda.

- Duración de la llamada.

- Descripción, si corresponde.

- Código de validación horizontal.

b) Eventos anómalos:

- Fecha en que ocurre el evento.

- Hora en que ocurre el evento.

- Descripción del evento.

- Código de validación horizontal.

c) Comunicaciones con el centro de conmutación:

- Fecha inicio.

- Hora inicio.

- Todos los dígitos y caracteres (*, #) enviados a través de la línea telefónica, para establecer la comunicación.

- Código de validación horizontal.

Línea final del reporte:

- Código de validación vertical.

La fecha de emisión del reporte se expresará en día, mes y año, las demás fechas se expresarán en día y mes, la duración de la llamada en horas, minutos y segundos y, los demás registros de tiempo se expresarán en horas y minutos.

#### Artículo 7º

El accionamiento de las teclas que posea no deberá alterar su funcionamiento normal ni la información registrada al momento de su instalación.

#### Artículo 8º

Deberá disponer, al interior de su carcaza, del mecanismo necesario para ingresar la información requerida al momento de la instalación.

#### Artículo 9º

Las conexiones del MCT a la línea telefónica deberá realizarse al interior de la carcaza de éste, la cual deberá ser sellada después de efectuarse la instalación, por lo tanto, no deberá tener conectores externos, salvo el correspondiente a la salida a impresora externa.

#### Artículo 10º

La falta de alimentación eléctrica para su funcionamiento, o falla del MCT, no deberá impedir el correcto funcionamiento del servicio telefónico.

#### Artículo 11º

La información registrada deberá permanecer sin ningún tipo de modificación, aunque falle la alimentación de energía eléctrica del MCT y sus baterías de respaldo.

#### Artículo 12º

La información almacenada en el MCT podrá ser visualizada por medio del visor, para lo cual deberá tener teclas que permitan leer en forma secuencial el contenido de los registros, número de teléfono, fecha, hora y duración de cada llamada o evento almacenado en su memoria. Las mencionadas teclas no permitirán, en ningún caso, realizar modificaciones de la información almacenada.

B. Características Funcionales del MCT

#### Artículo 13º

En el proceso de una llamada completada, la inversión de polaridad generada desde el centro de conmutación local, determinará el arranque del temporizador de consumo.

#### Artículo 14º

El temporizador de consumo se detendrá al detectar que el usuario que generó la llamada, cuelga.

#### Artículo 15º

En aquellas llamadas en que se detecte la secuencia de tono de ocupado antes de la apertura de la línea, en la visualización de la llamada y en el reporte escrito deberá aparecer el texto "Teléfono mal colgado" en el campo Descripción.

#### Artículo 16º

El reloj calendario del MCT se ajustará con la información, mes, día, hora y minuto, enviada desde el centro de conmutación local con la señal ANI.

#### Artículo 17º

El MCT registrará las llamadas completadas y los eventos anómalos, especificando la anomalía. Asimismo, deberá registrar y generar reportes de las comunicaciones que establezca el suscriptor con el centro de conmutación local, para programar servicios, tales como, candado electrónico, desvío de llamadas, etc.

#### Artículo 18º

En el proceso de una llamada, el MCT dará término a la captura del número marcado una vez detectada la inversión de polaridad.

#### Artículo 19º

El MCT deberá detectar la señal de apertura calibrada generada por la tecla R en el teléfono del suscriptor local y su registro será identificado con el símbolo de la letra R (Recomendación T.50 del CCITT).

#### Artículo 20º

En casos de servicios tales como "retención para consulta" o "conferencias multipartitas", la detección de la apertura calibrada deberá ser registrada junto al nuevo número telefónico capturado en aquellas llamadas completadas y en el reporte escrito deberá aparecer el texto "Apertura calibrada" en el campo Descripción.

#### Artículo 21º

El MCT deberá tener la capacidad de almacenamiento de registro mínimo de 1.500 llamadas.

#### Artículo 22º

El MCT deberá disponer de los siguientes indicativos luminosos de funcionamiento:

- De operación, señala que está funcionando.

- De alimentación, que señala el estado en que se encuentran las baterías de respaldo.

C. Características Eléctricas del MCT

#### Artículo 23º

La alimentación eléctrica para su funcionamiento no será la red pública telefónica, deberá estar respaldada por baterías recargables con una vida útil de dos años y una autonomía de, a lo menos, 10 horas.

El reemplazo de la batería de respaldo será responsabilidad del suscriptor, por lo tanto, será de acceso externo.

Los MCT deberán funcionar adecuadamente con 220 Volts ± 30% y una frecuencia de 50 Hz ± 1 Hz.

#### Artículo 24º

El módulo detector de señalización de marcación por pulsos y señales multifrecuencia (DTMF) y el detector del botón R, deberán operar de acuerdo a especificaciones indicadas en el Plan Técnico Fundamental de Señalización Telefónica respecto a las condiciones eléctricas del bucle de abonado.

#### Artículo 25º

La resistencia en serie agregada a la línea telefónica por el MCT deberá ser distribuida en partes iguales en los hilos a y b. El valor total no deberá exceder el 3% del valor máximo permitido para la resistencia del aparato telefónico, de acuerdo a especificaciones indicadas en el Plan Técnico Fundamental de Señalización Telefónica respecto a las condiciones eléctricas del bucle de abonado.

#### Artículo 26º

La impedancia mínima que el MCT deberá presentar a la línea telefónica en el rango de 300 a 3.400 Hz será de 60 Kohms.

#### Artículo 27º

La resistencia de aislamiento entre los hilos a y b de la línea telefónica, medida con una tensión de hasta 100 Vcc, deberá tener un valor superior a 2 Megaohms.

#### Artículo 28º

El MCT deberá estar protegido contra sobretensiones mayores de 200 volts de cresta, en la línea telefónica. Las protecciones no deben provocar asimetría en la línea telefónica.

D. Otras Características del MCT

#### Artículo 29º

Deberá ser construido con una carcaza que permita al usuario reemplazar la batería de respaldo, la cinta, la tinta o el papel de la impresora incorporada al MCT, si corresponde, sin afectar la inviolabilidad de éste.

#### Artículo 30º

Deberá tener una construcción mecánica que permita sellarlo para garantizar su inviolabilidad.

#### Artículo 31º

Deberá cumplir con las normas eléctricas vigentes en el país respecto de la seguridad de las personas.

#### Artículo 32º

Deberá estar protegido contra ondas radioeléctricas interferentes y no deberá provocar interferencias a terceros.

#### Artículo 33º

El sistema de fijación del MCT deberá ser accesible sólo desde el interior de la carcaza.

#### Artículo 34º

Deberá mantener las características de funcionamiento en el rango de temperaturas de -10° a 50°C. En ambiente de humedad se aceptará un límite de operación satisfactoria a la temperatura de 35°C con 75% de humedad relativa.

## Título III

De la instalación y operación del MCT

#### Artículo 35º

La instalación deberá ser realizada, en forma no discriminatoria, por la compañía telefónica local a solicitud escrita del suscriptor, cumpliendo con las especificaciones de instalación señaladas por el fabricante. Sin perjuicio de lo anterior, el MCT podrá ser adquirido o arrendado por el suscriptor a plena libertad, a la compañía telefónica local o a terceros.

#### Artículo 36º

La compañía telefónica que realice la instalación será responsable de verificar que el MCT se encuentre homologado por la Subsecretaría de Telecomunicaciones.

#### Artículo 37º

El MCT deberá ser instalado entre la instalación telefónica interior del suscriptor, en adelante la ITI, y la acometida telefónica.

#### Artículo 38º

Deberá instalarse en la estructura donde está fijado el comienzo de la ITI, en el caso que éste se encuentre a la intemperie se deberán tomar todas las medidas necesarias para proteger al MCT de las condiciones ambientales. El MCT debe quedar al alcance del suscriptor para permitir, por ejemplo, la visualización de la información registrada, el reemplazo de la batería de respaldo y la conexión de una impresora, cuando corresponda.

#### Artículo 39º

Al instalar el MCT se ingresará el número telefónico asociado a la línea y el número de homologación si no se ha grabado previamente del MCT, se inicializará, probará y sellará, sin que existan alambres desnudos o conectores externos, a excepción del conector destinado a la impresora externa.

#### Artículo 40º

La operación para visualizar las llamadas o para obtener el reporte escrito, deberá estar detallada en el manual elaborado por el fabricante.

#### Artículo 41º

Para extraer la información registrada, el suscriptor o la compañía telefónica local podrán conectar una impresora al único conector de señal que posee el MCT.

#### Artículo 42º

En el caso que se corte la alimentación de la red eléctrica y la batería de respaldo agote su carga, el MCT deberá registrar este evento y dejar de registrar las llamadas. Cuando se restablezca la energía, se registrará su reposición.

#### Artículo 43º

Todas las llamadas generadas en el centro de conmutación local, a requerimiento del suscriptor, y las llamadas de cobro revertido, no serán registradas por el MCT.

## Título IV

Disposiciones finales

#### Artículo 44º

Será responsabilidad del suscriptor mantener el MCT sin alteraciones, tales como rotura de sellos, cables, etc.

#### Artículo 45º

Los reclamos que se formulen por discrepancias entre la cuenta única telefónica y los registros del MCT, podrán ser presentados personalmente por el reclamante o por su representante ante la compañía telefónica. En caso de disconformidad con lo resuelto por la compañía, el reclamante podrá insistir ante la Subsecretaría de Telecomunicaciones, conforme a lo dispuesto en el Reglamento sobre Tramitación y Resolución de Reclamos de Servicios de Telecomunicaciones.

#### Artículo 46º

La obligación establecida en el artículo 38º del Reglamento del Servicio Público Telefónico respecto de que la compañía telefónica local deberá proveer el MCT, a petición y expensas del suscriptor que lo solicite, sin perjuicio de que el suscriptor lo adquiera a terceros, será exigible para las compañías telefónicas a contar de los seis meses posteriores a la publicación, en el Diario Oficial, de la presente norma.

Anótese y publíquese en el Diario Oficial.- Juanita Gana Quiroz, Subsecretaria de Telecomunicaciones.

Lo que transcribo para su conocimiento.- Saluda atentamente a Ud., Leonardo Mena Coronel, Jefe Div. Planificación Estratégica y Estudios.