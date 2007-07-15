ESTABLECE INDICACIONES PARA EL SOFTWARE Y RECOLECCION DE DATOS PARA EL CONTROL DE EMISIONES A QUE SE REFIERE EL DECRETO 149 DE 2006

Núm. 1.191 exenta.- Santiago, 28 de junio de 2007.- Visto: Lo dispuesto en la Constitución Política de la República, en especial en sus artículos 19 Nº 8 y 32 Nº 6; en la Ley Nº19.300, sobre Bases Generales del Medio Ambiente; en la Ley Nº 18.290, de Tránsito, en especial, en su artículo 56; en el decreto supremo Nº 149 de 2006, del Ministerio de Transportes y Telecomunicaciones, y la demás normativa aplicable.

Considerando:

1) Que el decreto supremo 149/2006 del Ministerio de Transportes y Telecomunicaciones, publicado en el Diario Oficial de fecha 24 de abril de 2007, ha dispuesto la norma de emisión para Óxido Nitroso (NO), Hidrocarburos (HC) y Monóxido de Carbono (CO), para el control de la emisión de Óxidos de Nitrógeno en vehículos en uso, dotados de motor de encendido por chispa, que cumplen con las normas de emisión establecidas en D.S. Nº 211 de 1991 y D.S. Nº 54 de 1994, ambos del Ministerio de Transportes y Telecomunicaciones.

2) Que el mencionado decreto supremo 149/2006 establece en el artículo 7º letra c), que el proceso de ensayo y recolección de datos deberá ser automático y cumplir con las indicaciones que el Ministerio de Transportes y Telecomunicaciones defina mediante resolución, la cual deberá ser publicada en el Diario Oficial,

Resuelvo:

#### Artículo único

El proceso de ensayo y recolección de datos de la prueba de emisiones regulada por el DS Nº 149/2006, del Ministerio de Transportes y Telecomunicaciones, deberá ser automático, para lo cual el software respectivo deberá considerar los siguientes aspectos a cumplir:

a) Requerimientos Generales

1. Las funcionalidades y equipos de medición que sean necesarios implementar, deberán estar integrados al sistema que controla las líneas de revisión de la planta de revisión técnica.

2. Para los efectos de selección de la marca y modelo de los vehículos, el sistema computacional de la planta revisora deberá permitir desplegar el listado que el Ministerio de Transportes y Telecomunicaciones le proporcione, el cual contendrá, a lo menos, para cada vehículo la siguiente información:

* Marca.

* Modelo.

* Año

* Cilindrada.

* Transmisión.

* Inercia Equivalente (IE) en [kg].

3. Antes de iniciar la prueba, el sistema deberá fijar automáticamente en el dinamómetro la potencia de ensayo sobre la base del listado mencionado en el punto anterior, es decir, con el valor de Inercia (IE), el software, de acuerdo con los procedimientos descritos en el artículo 6º del D.S. 149/2006 deberá, automáticamente, calcular y ajustar en el dinamómetro la potencia de ensayo para el modo 5015 y el modo 2525 respectivamente.

4. Si una marca y/o modelo de vehículo a ensayar no estuviera en la tabla provista por el Ministerio, el sistema automáticamente deberá ser capaz de ajustar la potencia de ensayo utilizando la Tabla Nº 7 del decreto 149/2006 antes citado.

5. La temperatura ambiente, la humedad y la presión barométrica deberán ser registradas automáticamente por el software al menos al inicio de la prueba.

6. El software del analizador deberá controlar automáticamente los siguientes puntos de preparación antes de cada ensayo:

* Un ajuste automático de cero usando el gas especificado por la Guía Técnica de la Environment Protection Agency EPA (EPA-AA-RSPD-IM-96-2, July 1996) que incluya los siguientes gases: Hidrocarburos (HC), Monóxido de Carbono (CO), Dióxido de Carbono (CO2) y Óxido Nitroso (NO).

* Lectura de aire ambiente introducido por cualquier punto después de la sonda de toma de muestra (incluida la manguera y el filtro y trampa de agua) y antes de la bomba de muestreo.

Se registrará la concentración de los siguientes gases: HC, CO, CO2 y NO.

* Lectura del aire ambiente a través de la sonda de toma de muestra y registro de la concentración de HC de fondo. Antes de iniciar una prueba con el analizador se deberá asegurar que se cumplan las siguientes condiciones:

i. La concentración de HC medida debe ser menor

que 15 ppm.

ii. La diferencia entre los valores de HC medidos

del aire ambiente y el registrado a través de

la sonda debe ser menor que 12 ppm ([muestra

desde la sonda-aire ambiente]< 12 ppm).

b) Protocolo de Ensayo

Modo 5015

1. Una vez preparado el vehículo de acuerdo a las instrucciones impartidas en el Manual de Procedimientos e Interpretación de Resultados respectivo, se deberá alcanzar la velocidad de 24 [km/hr]. Cuando dicha velocidad se mantenga constante dentro de un rango de + 2 [km/hr] durante 5 segundos continuos y el torque permanezca constante dentro de un rango de + 5% del valor requerido para la potencia ingresada, el equipo automáticamente deberá dar inicio al modo, marcándose el tiempo del mismo como t=0.

2. El vehículo deberá permanecer por los próximos 20 segundos (hasta t=20), estabilizado a la potencia y velocidad correspondientes al modo y dentro de los rangos indicados en el punto anterior. Durante estos 20 segundos se deberá observar la presencia de humos visibles (negro o azul), los que de constatarse darán motivo a la detención de la prueba y el resultado de rechazo por humos visibles.

3. Si no hay humos visibles, en t=20 comenzará el registro cada un segundo de las concentraciones de HC, CO, NO, CO2 y Oxígeno (O2).

4. A partir de t=30 se calculará el promedio móvil de los últimos 10 segundos registrados a partir de t=20, para los contaminantes HC, CO y NO.

5. El resultado del primer promedio móvil, calculado en t=30, deberá compararse instantáneamente con los valores límites correspondientes de las Tablas Nº 1, Nº 2, Nº 3, Nº 4, Nº5 o Nº 6 de DS Nº 149/2006, según corresponda.

6. Si en t=30 el promedio móvil calculado para cada uno de los contaminantes fuera menor o igual a los límites señalados en las tablas indicadas precedentemente, concluirá el modo con resultado de aprobación. Si esta condición no se cumple se continuará con el cálculo del siguiente promedio móvil, hasta que se cumpla la condición de aprobación o t sea igual a 100 segundos (t=100). Si para t=100 aún no se ha cumplido la condición de aprobación el vehículo será rechazado. Se registrará como resultado del modo el promedio móvil de aprobación o el valor del último registro de rechazo, obtenido durante el modo.

7. Durante todo el modo se deben mantener los rangos señalados en el número 1 precedente. De lo contrario, si esto ocurre por más de 1 segundo, el conteo deberá volver a 0.

Modo 2525

1. Inmediatamente terminado el modo 5015, y sin detener el vehículo, independiente de su resultado de aprobación o rechazo, se deberá alcanzar la velocidad de 40 [km/hr]. Cuando dicha velocidad se mantenga constante dentro de un rango de + 2 [km/hr] durante 5 segundos continuos y el torque permanezca constante dentro de un rango de + 5% del valor requerido para la potencia ingresada, el equipo automáticamente deberá dar inicio al modo, marcándose el tiempo del mismo como t=0.

2. El vehículo permanecerá por los próximos 20 segundos estabilizado a la potencia y velocidad correspondientes al modo y dentro de los rangos indicados en el punto anterior.

3. Si no hay humos visibles, en t=20 comenzará el registro cada un segundo de las concentraciones de HC, CO, NO, CO2 y Oxígeno (O2).

4. A partir de t=30 se calculará el promedio móvil de los últimos 10 segundos registrados a partir de t=20, para los contaminantes HC, CO y NO.

5. El resultado del primer promedio móvil, calculado en t=30, deberá compararse instantáneamente con los valores límites correspondientes de las Tablas Nº 1, Nº 2, Nº 3, Nº 4, Nº5 o Nº 6 de DS Nº 149/2006, según corresponda.

6. Si en t=30 el promedio móvil calculado para cada uno de los contaminantes fuera menor o igual a los límites señalados en las tablas indicadas precedentemente, concluirá el modo con resultado de aprobación. Si esta condición no se cumple se continuará con el cálculo del siguiente promedio móvil, hasta que se cumpla la condición de aprobación o t sea igual a 60 segundos (t=60). Si para t=60 aún no se ha cumplido la condición de aprobación el vehículo será rechazado. Se registrará como resultado del modo el promedio móvil de aprobación o el valor del último registro de rechazo, obtenido durante el modo.

7. Durante todo el modo se deben mantener los rangos señalados en el número 1 precedente. De lo contrario, si esto ocurre por más de 1 segundo, el conteo deberá volver a 0.

c) Requisitos Específicos

1. El software deberá vincular adecuadamente los registros de emisión con la velocidad del vehículo, considerando las demoras por tiempos de respuesta de los analizadores.

2. La aplicación del torque para la obtención de la potencia de ensayo, para cada modo, deberá realizarse mediante una transición suave durante el periodo de aceleración.

3. El cálculo de las emisiones se realizará conforme Guía Técnica de la EPA (EPA-AA-RSPD-IM-96-2, July 1996), §85.1(b)(1), e incluirá las correcciones por factor de dilución (DCF) y humedad (Kh).

4. Adicionalmente el software deberá calcular para cada modo, con los valores de aprobación o rechazo, el valor de la relación aire/combustible (AFR).

Esta deberá ser calculada según lo establecido en la Directiva 70/220 CEE, mediante la ecuación de Brettschneider.

5. Todas las operaciones antes descritas deberán ser automatizadas por el software sin intervención del operador, con excepción de la detención de la prueba por humos visibles, como así también cualquier parada de emergencia.

6. La información adicional que debe quedar grabada en la Planta de Revisión Técnica para cada registro de los vehículos sometidos a la prueba será:

a. Hora de inicio (t=0) y hora de término de cada

modo, con detalle de segundos.

b. La IE (cuando corresponda).

c. Humedad Relativa promedio durante el ensayo [%]

d. Temperatura promedio durante el ensayo [ºC]

e. Presión Atmosférica [mm Hg]

f. HC Promedio Móvil Final [ppm] (modo 5015 y

2525)

g. CO Promedio Móvil Final [%] (modo 5015 y 2525)

h. NO Promedio Móvil Final [ppm] (modo 5015 y

2525)

i. CO2 Promedio Móvil Final [%] (modo 5015 y 2525)

j. O2 Promedio Móvil Final [%] (modo 5015 y 2525)

k. Potencia de Ensayo (modo 5015 y 2525)

l. Relación Aire Combustible para cada modo

Anótese y publíquese.- René Cortázar Sanz, Ministro de Transportes y Telecomunica-ciones.

Lo que transcribo para su conocimiento.- Saluda a Ud., Gloria Montecinos L., Jefa Depto. Administrativo.