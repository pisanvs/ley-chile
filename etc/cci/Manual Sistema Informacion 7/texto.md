CARTA CIRCULAR

MANUAL SISTEMA INFORMACION N° 7/2015

Santiago, 31 de julio de 2015

Señor Gerente:

Crea archivos C46, C47 y C48 relacionados con la gestión y medición de la

posición de liquidez.

A fin de obtener la información que se requiere para la aplicación de las nuevas

normas del Capítulo III.B.2.1 del Compendio de Normas Financieras del Banco

Central de Chile y del Capítulo 12-20 de la Recopilación Actualizada de Normas,

sobre gestión y medición de la posición de liquidez, se crean los archivos C46

"Situación de liquidez", C47 "Índices de concentración" y C48 "Razones de

liquidez", junto con una serie de nuevas tablas que los complementan.

El nuevo archivo C46 deberá enviarse por primera vez con la información referida

a la primera semana del mes de diciembre de 2015. Por su parte, los archivos C47

y C48 se remitirán a partir de la información de la primera semana del mes de

marzo de 2016.

El archivo C08 que actualmente se utiliza, se seguirá enviando hasta la

información referida al último día del mes de marzo de 2016.

Se agregan al Manual del Sistema de Información las hojas correspondientes a las

instrucciones para los nuevos archivos C46, C47 y C48 y las nuevas tablas 80,

81, 82, 83, 84, 85, 86, 87 y 88. Además se reemplazan las hojas del Catálogo de

Archivos y se agrega una segunda hoja al Catálogo de Tablas. Adicionalmente, se

acompañan nuevas hojas de las instrucciones de los archivos C40, C41, C42 y C43,

en las cuales se han actualizado las referencias a las normas del Banco Central

de Chile y de esta Superintendencia.

Saludo atentamente a Ud.,

ERIC PARRADO HERRERA

Superintendente de Bancos e

Instituciones Financieras

ARCHIVO C46

Hoja 1

CODIGO : C46

NOMBRE : SITUACION DE LIQUIDEZ

SISTEMA : Contable

PERIODICIDAD : Semanal, para información individual y consolidada local,

referida a los días 4, 8, 12, 16, 20, 24, 28 y último día de cada mes.

Mensual: para información consolidada global, referida al último día de cada

mes.

PLAZO : 3 días hábiles: desde la fecha a que se refiere la información,

para información individual y consolidada local.

9 días hábiles: desde el último día del mes, para información consolidada

global.

Este archivo incluirá información periódica sobre el cómputo para los límites

que tratan las Normas sobre la Gestión y Posición de Liquidez contenidas en el

Capítulo 12-20 de la Recopilación Actualizada de Normas (RAN).

Por tratarse de información compleja y que considera distintos niveles de

consolidación, también se contempla una menor periodicidad para aquella

información que consolide con las filiales y sucursales del exterior, la que

sólo deberá ser enviada el último día del mes.

Estas instrucciones también serán aplicables a aquella información que la

Superintendencia pudiera requerir a los bancos de manera especial, como podría

ser el caso de aquella referida únicamente a filiales o sucursales en el

exterior, o cuando se requiera una periodicidad distinta.

Primer registro

.

### 1. CÓDIGO DE LA IF

Corresponde a la identificación de la institución financiera según la

codificación dada por esta Superintendencia. Cuando la Superintendencia requiera

un archivo con información especial, referida solamente a sus sucursales o

filiales en el exterior, corresponderá utilizar el código que la

Superintendencia le haya asignado particularmente para su identificación.

### 2. IDENTIFICACIÓN DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "C46".

### 3. FECHA

Corresponde a la fecha del día a que se refiere la información, en formato

AAAAMMDD. En caso que el último día del mes coincida con el último día par del

mes, entonces el banco solo deberá reportar el fin de mes.

ARCHIVO C46

Hoja 2

REGISTROS SIGUIENTES

Los registros siguientes contendrán información de distinta índole, por lo cual

en el primer campo de cada registro se identificará de qué información se trata,

según los siguientes códigos:

Código Tipo de registro (contenido)

01 Control de límites de descalce de plazo

02 Detalle de flujos de ingreso y egresos

Registro para remitir información sobre el control de límites de descalce de

plazo

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "01".

### 2. NIVEL DE CONSOLIDACIÓN

Código asociado al nivel de consolidación de los flujos de efectivo reportados

por el banco. Se deberá indicar el grado de consolidación de los flujos de

efectivo según los códigos de la Tabla 80 de este Manual. La información

relativa al nivel de consolidación 3 (consolidado global) sólo se incluye en el

archivo referido a la información del último día del mes.

### 3. TIPO DE MONTO PARA CONTROL DE LÍMITES

Se debe informar el código del tipo de monto informado los códigos de la Tabla

81 de este Manual.

### 4. MONTO

Corresponde al monto especificado de acuerdo con los campos anteriores.

Cuando no se disponga aún del dato del capital básico referido al último día de

un mes, se tomará el monto informado en el archivo de la fecha anterior. Si

hubiera un aumento (o disminución) de capital pagado después de ese día, se

agregará (o deducirá) de ese monto.

Los descalces de plazos corresponden al monto del descalce (suma egresos – suma

ingresos), de acuerdo a plazos contractuales que se originan en diferentes

ventanas temporales. Lo anterior, según lo indicado en el numeral 2 del Título

III del Capítulo 12-20 de la RAN (signo negativo indica: egresos ˂ ingresos).

ARCHIVO C46

Hoja 3

Registro para remitir información sobre el detalle de flujos de ingreso y egreso

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "02".

### 2. NIVEL DE CONSOLIDACIÓN

Sigue las mismas instrucciones indicadas en el campo 2 del registro 01.

### 3. TIPO MONTO BASE

Indica el método para computar los flujos utilizando los siguientes códigos:

Código Tipo de monto

1 Base contractual

2 Base ajustada

3 Base contractual - sin ajustes

Los flujos de efectivo clasificados bajo código 3 deberán informarse sin

considerar ningún tipo de ajuste por previsión de comportamiento.

### 4. TIPO FLUJO

Indica si se trata de flujos a favor o en contra, según los siguientes códigos:

Código Tipo de flujo

1 Egresos

2 Ingresos y disponible

Los egresos e ingresos siempre deberán informarse en forma separada. Por

ejemplo, para la información de las líneas de crédito, otorgadas por el banco e

informadas con código "Tipo Monto Base" igual a 1 o 2, se usará el código 1 para

los flujos de egreso correspondientes al uso esperado de las líneas y el código

2 para los ingresos estimados por el reembolso de los montos utilizados de esas

líneas.

### 5. BANDA TEMPORAL

Se utilizarán, según el plazo, los códigos de la Tabla 82 de este Manual. Los

flujos de egreso asociados a canje y operaciones del tipo overnight deberán

asignarse a la banda temporal 101, en tanto que los de ingreso se asignarán a la

banda 102.

ARCHIVO C46

Hoja 4

Cuando se trate de flujos con códigos Tipo de Monto Base (campo 3) igual a 1 o

3, los flujos de egreso, asociados a obligaciones a la vista y cuentas de ahorro

con giro incondicional, deberán asignarse a la primera banda, en tanto que los

importes de las cuentas con giro diferido deberán asignarse, por los montos que

correspondan, entre las bandas 101 y 415.

Cuando se trate de flujos con códigos Tipo de Monto Base (campo 3) igual a 3, el

valor razonable de los instrumentos financieros no derivados para negociación y

disponibles para la venta se asignarán a la primera banda temporal, sin ningún

ajuste de valor; el resto de los instrumentos financieros no derivados,

inclusive aquellos que tengan algún tipo de gravamen que impida su venta o

cesión, se informarán según flujo del emisor. Los cupos disponibles de líneas de

crédito se informarán en la primera banda temporal; los flujos de ingreso de

efectivo asociados a líneas de crédito o sobregiro que ya hayan sido utilizadas,

deberán ser informados en la última banda temporal; todos los demás flujos de

efectivo deberán informarse en las bandas que correspondan a la fecha que

contractualmente debiera efectuarse el pago o recibirse el reembolso, según

corresponda.

### 6. MONEDA DE PAGO

Se utilizarán los siguientes códigos, según la moneda de pago de los flujos:

1 = Pagadero en moneda nacional no reajustable.

2 = Pagadero en moneda nacional reajustable.

3 = Pagadero en moneda extranjera.

Para las filiales y/o sucursales en el extranjero, se entenderá como moneda

nacional aquella que corresponda al país de establecimiento del banco que

informa.

### 7. ORIGEN FLUJO

Identifica el tipo de operaciones o compromisos que originarán los flujos, según

la Tabla 83 de este Manual.

### 8. MONTO FLUJO

Corresponde al monto especificado de acuerdo con los campos anteriores.

Carátula de cuadratura

El archivo C46 debe entregarse con una carátula de cuadratura cuyo modelo se

especifica a continuación.

MODELO

.

ARCHIVO C46

Hoja 5

.

OBSERVACIONES:

La información contenida en el 1° registro debe corresponder a la resultante de

la información pertinente contenida en el registro con el detalle de los flujos

(2° registro), según se trate de información sobre base contractual ("Tipo monto

base" código 1), ajustada ("Tipo monto base" código 2) u otra. Mientras un banco

no mida sus descalces sobre base ajustada, los registros asociados a los códigos

5, 6, 7 de la Tabla 81 de este Manual se informarán con un cero.

El 2° registro incluirá todos los registros posibles producto de la combinación

de los 6 campos descriptivos, asignando valores cero al campo "monto flujo"

cuando ellos produzcan una combinación no aplicable a la situación del banco

(porque los conceptos combinados no representan un flujo posible o porque siendo

posible el banco no tiene ningún flujo que informar). Esto se aplica también

para los registros correspondientes a los flujos sobre base ajustada y base

contractual sin ajustes ("Tipo monto base" código 2, y 3, respectivamente),

cuando el banco deba informar ese tipo de flujos.

Los archivos con información consolidada, para el banco con sus filiales y/o

sucursales, debe ser concordante con la de los archivos con información del

banco individual, en el sentido de que los primeros deben contener información

sobre base ajustada a nivel consolidado cuando los segundos la contengan a nivel

individual.

ARCHIVO C47

Hoja 1

CODIGO : C47

NOMBRE : ÍNDICES DE CONCENTRACIÓN

SISTEMA : Contable

PERIODICIDAD : Semanal, para información individual y consolidada local,

referida a los días 8, 16, 24 y último día de cada mes, referida al día de la

información y a los días hábiles bancarios posteriores a la última fecha de

envío.

Mensual: para información consolidada global, referida al último día de cada

mes.

PLAZO : 3 día hábiles: desde la fecha a que se refiere la información,

para información individual y consolidada local.

9 días hábiles: desde el último día del mes, para información consolidada

global.

Este archivo incluirá información periódica sobre el cómputo de los Índices de

Concentración que tratan las Normas sobre la Gestión y Posición de Liquidez

contenidas en el Capítulo 12-20 de la Recopilación Actualizada de Normas (RAN).

Por tratarse de información compleja y que considera distintos niveles de

consolidación, también se contempla una menor periodicidad para aquella

información que consolide con las filiales y sucursales del exterior, la que

sólo deberá ser enviada el último día del mes.

Estas instrucciones también serán aplicables a aquella información que la

Superintendencia pudiera requerir a los bancos de manera especial, como podría

ser el caso de aquella referida únicamente a filiales o sucursales en el

exterior, o cuando se requiera una periodicidad distinta.

Primer registro

.

### 1. CÓDIGO DE LA IF

Corresponde a la identificación de la institución financiera según la

codificación dada por esta Superintendencia. Cuando la Superintendencia requiera

un archivo con información especial, referida solamente a sus sucursales o

filiales en el exterior, corresponderá utilizar el código que la

Superintendencia le haya asignado especialmente para su identificación.

### 2. IDENTIFICACIÓN DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "C47".

### 3. FECHA

Corresponde a la fecha del día a que se refiere la información, en formato

AAAAMMDD. En caso que el último día del mes coincida con el último día par del

mes, entonces el banco solo deberá reportar el fin de mes.

ARCHIVO C47

Hoja 2

REGISTROS SIGUIENTES

Los registros siguientes reportarán el seguimiento de pasivos a los que se

refiere el numeral 3.2 del Título III del Capítulo 12-20 de la RAN, así como el

detalle de las captaciones del banco. Esta información se identificará en el

primer campo de cada registro, según los siguientes códigos:

Código Tipo de registro (contenido)

01 Indicadores de concentración por contraparte

02 Indicadores de concentración por producto

03 Detalle de captaciones

Registro para remitir indicadores de concentración por contraparte

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "01".

### 2. NIVEL DE CONSOLIDACIÓN

Código asociado al nivel de consolidación de los flujos de efectivo reportados

por el banco. Se deberá indicar el grado de consolidación de los flujos de

efectivo según los códigos de la Tabla 80 de este Manual.

La información relativa al nivel de consolidación 3 (consolidado global) sólo se

incluye en el archivo referido a la información del último día del mes.

### 3. CONTRAPARTE

Identifica a la contraparte de la captación, según los códigos de la Tabla 85 de

este Manual.

### 4. CONCENTRACIÓN CONTRAPARTE

El indicador de concentración de contraparte se calculará de acuerdo con lo

señalado en el numeral 3.2.1 del Título III del Capítulo 12-20 de la RAN.

Deberá ser expresado en puntos porcentuales. Estos valores se informarán

redondeando al número entero más cercano, debiendo considerarse como una unidad

adicional las fracciones iguales o superiores a 0,5 puntos porcentuales.

### 5. TASA RENOVACIÓN

Corresponde al monto renovado, en productos referidos al código 2 de la Tabla 86

de este Manual, de acuerdo a lo señalado en el numeral 3.2.2 del Título III del

Capítulo 12-20 de la RAN. Una operación se considerará como una renovación

cuando en la misma fecha de vencimiento de una captación a plazo

(individualizada a nivel de RUT u otro ID equivalente que identifique a la

contraparte) se pacte otra captación de la misma naturaleza y por un monto igual

o inferior a la que haya vencido.

ARCHIVO C47

Hoja 3

Deberá ser expresado en puntos porcentuales. Estos valores se informarán

redondeando al número entero más cercano, debiendo considerarse como una unidad

adicional las fracciones iguales o superiores a 0,5 puntos porcentuales.

Registro para remitir indicadores de concentración por producto

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "02".

### 2. NIVEL DE CONSOLIDACIÓN

Sigue las mismas instrucciones indicadas en el campo 2 del registro 01.

### 3. INSTRUMENTO DE CAPTACIÓN

Corresponde al código de identificación del tipo de captación, de acuerdo con la

Tabla 86 de este Manual.

### 4. CONCENTRACIÓN

El indicador de Concentración por Instrumento de Captación se calculará de

acuerdo con lo señalado en el numeral 3.2.3 del Título III del Capítulo 12-20 de

la RAN.

Deberá ser expresado en puntos porcentuales. Estos valores se informarán

redondeando al número entero más cercano, debiendo considerarse como una unidad

adicional las fracciones iguales o superiores a 0,5 puntos porcentuales.

### 5. PLAZO RESIDUAL

El plazo residual por producto se calculará de acuerdo a lo señalado en el

numeral 3.2.4 del Título III del Capítulo 12-20 de la RAN, expresado en número

de días.

Registro para remitir detalle de captaciones

.

ARCHIVO C47

Hoja 4

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "03".

### 2. NIVEL DE CONSOLIDACIÓN

Sigue las mismas instrucciones indicadas en el campo 2 del registro 01.

### 3. INSTRUMENTO DE CAPTACIÓN

Sigue las mismas instrucciones indicadas en el campo 3 del registro 02.

### 4. CONTRAPARTE

Sigue las mismas instrucciones indicadas en el campo 3 del registro 01.

### 5. MONEDA

Corresponde a la identificación de las monedas extranjeras, en las que se

materializarán los flujos de efectivo, según los códigos de la Tabla 1 de este

Manual, cuando dichas monedas sean clasificadas como significativas. Una moneda

se considerará significativa cuando las posiciones pasivas agregadas,

denominadas en esa moneda, representen más de un 5% de los pasivos totales.

Cuando las monedas extranjeras no sean significativas, según lo indicado en el

párrafo anterior, pero pertenezcan al siguiente grupo: EUR, GBP, CHF, JPY (Euro,

Libra esterlina, Franco suizo, Yen), se identificarán con el Código 777. Cuando

se trate de monedas extranjeras no significativas y no pertenezcan al grupo

anterior, se clasificarán con el código 888.

Cuando se reporte en la moneda local, deberá utilizarse el código "000".

### 6. VENCIMIENTO CONTRACTUAL

Corresponde a la banda de vencimiento en la que se hacen efectivos los flujos,

de acuerdo a los códigos establecidos en la Tabla 84 de este Manual.

Los montos a la vista (código 101) se reportarán conforme a los instrumentos que

venzan el día de referencia de la información contenida en este archivo.

### 7. SALDO CAPTACIONES

Corresponde al saldo de captaciones, según lo especificado en los campos

anteriores.

### 8. RENOVACIONES MAYORISTAS

Corresponde al monto renovado, en productos referidos al código 2 de la Tabla 86

de este Manual, con contrapartes mayoristas (códigos desde el 03 al 15 de Tabla

85 de este Manual), que se lleven a cabo el día al cual está referida la

información de este archivo. Una operación se considerará como una renovación

cuando en la misma fecha de vencimiento de una captación a plazo

(individualizada a nivel de RUT u otro ID equivalente que identifique a la

contraparte) se pacte otra captación de la misma naturaleza y por un monto igual

o inferior a la que haya vencido.

Cuando se trate de una contraparte minorista (código de contraparte 01 y 02,

Tabla 85 de este Manual), o de un instrumento de captación con código distinto a

2, el banco deberá llenar el registro con cero.

ARCHIVO C47

Hoja 5

### 9. TASA INTERES

Corresponde a la tasa de interés promedio ponderada (tasa de referencia más

spread, cuando corresponda) de las Renovaciones Mayoristas informadas en el

campo 8. Debe calcularse según lo siguiente:

.

Donde:

r = tasa de interés promedio ponderada.

ri = tasa de interés anual para la operación de renovación "i".

mi = monto de la operación "i".

M = monto total de las operaciones del registro (igual a lo informado en el

campo 8).

Carátula de cuadratura

El archivo C47 debe entregarse con una carátula de cuadratura cuyo modelo se

especifica a continuación.

MODELO

.

OBSERVACIONES

El noveno campo del registro 03 ("Tasa Interés"), debe ser una tasa de interés

anual, en línea con aquella requerida en el archivo de deudores D33, la cual

deberá ser calculada teniendo en consideración las siguientes convenciones:

a) Tasas consignadas en forma vencida. Si una operación se pacta con interés

anticipado, se incorporará traduciendo la tasa previamente a su equivalente de

tasa vencida.

b) Base anual de 360 días. En la expresión de las tasas se considerarán meses de

30 días y años de 360 días.

c) Tasa de interés anual. Se debe consignar el equivalente financiero anual (ra)

de la tasa de interés aplicada a la operación. Para tal efecto, debe

considerarse la tasa de interés mensual equivalente (ra) capitalizada durante

doce períodos. Algebraicamente, esto corresponde a:

.

ARCHIVO C47

Hoja 6

Para mayor claridad, se entregan los siguientes ejemplos:

Ejemplo 1: Una tasa interés de 9,00% a 3 meses (90 días) equivale a una tasa de

2,914246657...% mensual (rm) y a una tasa anual de 41,1582% (ra). La tasa

mensual equivalente, corresponde a la tasa que capitalizada (en forma compuesta)

durante n periodos (n=3, en este caso) genera un interés equivalente al

efectivamente aplicado (9%, en este caso).

Algebraicamente:

.

Ejemplo 2: Una tasa interés de 1,00% mensual (rm), equivale a una tasa de

12,6825% anual (ra). En este caso, la cifra se obtiene de la aplicación directa

de la expresión consignada en el primer párrafo de este literal c).

Ejemplo 3: Una tasa de interés de 0,1167% diario, equivale a una tasa de 3,5010%

mensual (rm) y a una tasa anual de 51,1244% (ra). En este caso, y en atención a

lo el Artículo 9° de la Ley N° 18.010, la tasa mensual equivalente se obtiene

multiplicando por 30 la tasa diaria aplicable.

ARCHIVO C48

Hoja 1

CODIGO : C48

NOMBRE : RAZONES DE LIQUIDEZ

SISTEMA : Contable

PERIODICIDAD : Todos los días pares, para información individual y consolidada

local, referida al día de la información y el día hábil bancario posterior a la

última fecha de envío.

Mensual: para información consolidada global, referida al último día de cada

mes.

PLAZO : 2 días hábiles: desde la fecha a que se refiere la información

para información individual y consolidada local.

7 días hábiles: desde el último día del mes, para información consolidada

global.

Este archivo incluirá información periódica sobre el cómputo de los indicadores

Razón de Cobertura de Liquidez y Razón de Financiamiento Neto Estable que tratan

las Normas sobre la Gestión y Posición de Liquidez contenidas en el Capítulo 12-

20 de la Recopilación Actualizada de Normas (RAN).

Por tratarse de información compleja y que considera distintos niveles de

consolidación, también se contempla una menor periodicidad para aquella

información que consolide con las filiales y sucursales del exterior, la que

sólo deberá ser enviada el último día del mes.

Estas instrucciones también serán aplicables a aquella información que la

Superintendencia pudiera requerir a los bancos de manera especial, como podría

ser el caso de aquella referida únicamente a filiales o sucursales en el

exterior, o cuando se requiera una periodicidad distinta.

Primer registro

.

### 1. CÓDIGO DE LA IF

Corresponde a la identificación de la institución financiera según la

codificación dada por esta Superintendencia. Cuando la Superintendencia requiera

un archivo con información especial, referida solamente a sus sucursales o

filiales en el exterior, corresponderá utilizar el código que la

Superintendencia le haya asignado especialmente para su identificación.

### 2. IDENTIFICACIÓN DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "C48".

### 3. FECHA

Corresponde a la fecha del día a que se refiere la información, en formato

AAAAMMDD. En caso que el último día del mes coincida con el último día par del

mes, entonces el banco solo deberá reportar el fin de mes.

ARCHIVO C48

Hoja 2

REGISTROS SIGUIENTES

Los registros siguientes reportarán los indicadores de monitoreo a los que se

refieren los numerales 3.4 y 3.5 del Título III del Capítulo 12-20 de la RAN,

así como el detalle de los flujos de efectivo del banco. Esta información se

identificará en el primer campo de cada registro, según los siguientes códigos:

Código Tipo de registro (contenido)

01 Indicadores de monitoreo

02 Flujos de efectivo

Registro para remitir los indicadores de monitoreo

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "01".

### 2. NIVEL DE CONSOLIDACIÓN

Código asociado al nivel de consolidación de los flujos de efectivo reportados

por el banco. Se deberá indicar el grado de consolidación de los flujos de

efectivo según los códigos de la Tabla 80 de este Manual. La información

relativa al nivel de consolidación 3 (consolidado global) sólo se incluye en el

archivo referido a la información del último día del mes.

### 3. MONEDA

Corresponde a la identificación de las monedas extranjeras, en las que se

materializarán los flujos de efectivo, según los códigos de la Tabla 1 de este

Manual, cuando dichas monedas sean clasificadas como significativas. Una moneda

se considerará significativa cuando las posiciones pasivas agregadas,

denominadas en esa moneda, representen más de un 5% de los pasivos totales.

Cuando las monedas extranjeras no sean significativas, según lo indicado en el

párrafo anterior, pero pertenezcan al siguiente grupo: EUR, GBP, CHF, JPY (Euro,

Libra esterlina, Franco suizo, Yen), se identificarán con el Código 777. Cuando

se trate de monedas extranjeras no significativas y no pertenezcan al grupo

anterior, se clasificarán con el código 888.

Cuando se reporte la moneda funcional del banco, deberá utilizarse el código

"000", independientemente si se trata de versiones reajustables.

ARCHIVO C48

Hoja 3

### 4. ACTIVOS LÍQUIDOS

El colchón de Activos Líquidos se calculará de acuerdo con lo señalado en el

numeral 3.4 del Título III del Capítulo 12-20 de la RAN. Las categorías de los

instrumentos, tales como "activos líquidos nivel 1" y "activos líquidos nivel

2", y sus respectivos ponderadores, se obtendrán de las Tablas 87 y 88 de este

Manual, respectivamente.

### 5. EGRESOS NETOS

Los Egresos Netos se calcularán de acuerdo con lo señalado en el numeral 3.4 del

## Título III — del Capítulo 12-20 de la RAN. Las categorías de los flujos de

efectivo, tales como "ingresos" y "egresos", y sus respectivos ponderadores, se

obtendrán de las Tablas 87 y 88 de este Manual, respectivamente.

### 6. FUENTES DE FINANCIAMIENTO ESTABLE

Las Fuentes de Financiamiento Estable se calcularán de acuerdo a lo señalado en

el numeral 3.5 del Título III del Capítulo 12-20 de la RAN. La categoría de los

flujos de efectivo para determinar el "financiamiento disponible" (FD) y sus

respectivos ponderadores, se obtendrán de las Tablas 87 y 88 de este Manual,

respectivamente.

### 7. FINANCIAMIENTO ESTABLE REQUERIDO

El Financiamiento Estable Requerido se calculará de acuerdo a lo señalado en el

numeral 3.5 del Título III del Capítulo 12-20 de la RAN. La categoría de los

flujos de efectivo para determinar el "financiamiento requerido" (FR) y sus

respectivos ponderadores, se obtendrán de las Tablas 87 y 88 de este Manual,

respectivamente.

Registro para remitir los flujos de efectivo

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "02".

### 2. NIVEL DE CONSOLIDACIÓN

Sigue las mismas instrucciones indicadas en el campo 2 del registro 01.

### 3. CATEGORÍA

Corresponde al código de identificación del flujo de efectivo, de acuerdo con la

Tabla 87 de este Manual.

### 4. BANDA TEMPORAL

Corresponde a la banda de vencimiento en la que se hacen efectivos los flujos,

de acuerdo a los códigos establecidos en la Tabla 84 de este Manual.

ARCHIVO C48

Hoja 4

5. PAÍS

Corresponde a la identificación del país, de las categorías indicadas en el

cuarto campo de la Tabla 87, según los códigos de la Tabla 45 de este Manual.

Cuando no corresponda clasificar el país de la categoría, el campo deberá ser

llenado con cero.

### 6. MONEDA

Sigue las mismas instrucciones indicadas en el campo 3 del registro 01.

### 7. FLUJO DE EFECTIVO

Corresponde al monto del flujo, según lo especificado en los campos anteriores.

Carátula de cuadratura

El archivo C48 debe entregarse con una carátula de cuadratura cuyo modelo se

especifica a continuación.

MODELO

.

OBSERVACIONES

Los campos 4 a 7 del registro 01 ("coeficientes de razones de liquidez") deben

corresponder al cómputo que resulte de aplicar las instrucciones de los

numerales 3.4 y 3.5 del Título III del Capítulo 12-20 de la RAN, utilizando la

información pertinente contenida en los registros con el detalle de los flujos,

correspondiente al segundo registro.

En el registro 02 ("flujos de efectivo"), los bancos deberán incluir todos los

registros posibles que se obtienen, combinando los campos que componen el

registro, asignando valores igual a cero para aquella información que no sea

aplicable (porque los conceptos combinados no representan un flujo posible o,

porque siendo posible, el banco no tiene ningún flujo que informar).

Catálogo de Tablas - Hoja 2

.

Tablas 80, 81 y 82

Tabla 80: Nivel de consolidación

.

* La información consolidada local agrupa a los flujos originados por las

filiales constituidas en el país. Lo mismo se aplica para la información

consolidada local para filiales en el extranjero (la distinción entre esos

niveles de consolidación se logra al asignar los códigos de instituciones

financieras definidos por esta Superintendencia).

**La información consolidada global considera los flujos originados tanto por

filiales locales como extranjeras (incluidas sus sucursales)

Tabla 81: Tipos de montos para control de límites

.

Tabla 82: Bandas temporales

.

Tabla 83

Tabla 83: Origen de los flujos

.

Tabla 83 - Hoja 2

.

Tabla 83 - Hoja 3

.

*La distinción entre contrapartes minoristas y mayoristas deberá hacerse de

acuerdo con los criterios establecidos en el numeral 1 del Título III del

Capítulo 12-20 de la RAN.

** Cuando la información corresponda a base consolidada, no deberán reportarse

en este origen flujos de efectivo provenientes de filiales que consoliden con el

banco.

Tablas 84, 85 y 86

Tabla 84: Vencimientos contractuales

Código Banda temporal

1 Sin vencimiento contractual

2 Menor a 30 días

3 Entre 30 y 90 días

4 Entre 91 días y menor a 180 días

5 Entre 181 días y menor a 1 año

6 Entre 1 año y menor a 2 años

7 Igual o mayor a 2 años

Tabla 85: Tipos de contraparte

Código Contraparte

01 Minoristas - personas naturales(*)(**)

02 Otros minoristas(*)(**)

03 Banco Central del país

04 Tesorería General de la República

05 Otros bancos del país

06 Cooperativas fiscalizadas por la SBIF

07 Emisores y operadores de tarjetas de crédito bancarios y no bancarios

08 Bancos extranjeros

09 Fondos de pensiones del país

10 Administradoras generales de fondos del país

11 Compañías de seguros del país

12 Corredores de bolsa y agentes de valores del país

13 Otras entidades financieras no bancarias del país

14 Mayoristas(*) no financieros del país

15 Mayoristas(*) extranjeros no bancarios

*La distinción entre contrapartes minoristas y mayoristas debe hacerse de

acuerdo con los criterios establecidos en el número 1 del Título III del

Capítulo 12-20 de la RAN

** Esta clasificación tendrá efecto solo para el registro referido a "detalle de

captaciones" (tercer registro del archivo C47).

Tabla 86: Instrumentos de Captación.

Código Instrumentos de captación

1 Depósitos y Obligaciones a la vista

2 Depósitos a plazo

3 Cuentas de ahorro a plazo

4 Operaciones de Retro compra

5 Bonos y efectos de comercio

6 Letras de crédito y bonos hipotecarios

9 Otros

Tabla 87

Tabla 87: Categorías de activos y flujos para la medición de las razones de

liquidez (RCL y RFEN)

.

Tabla 87- hoja 2

.

Tabla 87 - hoja 3

.

Tabla 87 - hoja 4

.

Tabla 87 – hoja 4

.

FER: Financiamiento requerido

FED: Financiamiento disponible

Notas:

(1) Valor corriente de mercado (sin considerar haircuts por liquidez de

mercado).

(2) Flujo contractual.

Tabla 87 - hoja 5

(3) Flujo contractual. Cuando la restricción sea menor a 180 días, los flujos se

reportarán como si no existiera restricción, es decir bajo el activo y banda

temporal que corresponda.

(4) Flujo contractual. Si los activos recibidos en pacto son computados en otra

categoría, el flujo debe ser computado en términos netos; en caso contrario, en

términos brutos.

(5) Montos aprobados no utilizados.

(6) Flujo contractual. Si los activos recibidos en garantía son computados en

otra categoría, el flujo debe ser computado en términos netos; en caso

contrario, en términos brutos. Las garantías entregadas y recibidas por el banco

deberán computarse netas, en la medida que las garantías recibidas estén a libre

disposición del banco (puedan ser enajenadas).

(7) Montos aprobados no utilizados. Si los activos recibidos en garantía son

computados en otra categoría, el flujo debe ser computado en términos netos; en

caso contrario, en términos brutos.

(8) Requerimientos adicionales de liquidez por eventos adversos, internos o

externos, que puedan generarse en un periodo de 30 días, por motivos de fraude

interno, fraude externo, pérdidas derivadas del incumplimiento involuntario o

negligencia de una obligación profesional a clientes concretos o de naturaleza

de diseño de un producto, pérdida por errores en el procesamiento de operaciones

o gestión de procesos, daños a los activos materiales, incidencias en el negocio

o fallos en los sistemas y relaciones laborales y seguridad en el puesto de

trabajo.

(9) Sumatoria del producto entre el valor corriente de mercado de cada

instrumento y el haircut que corresponda de la Tabla 88 de este Manual. El monto

total debe imputarse en la primera banda.

(10) Sumatoria valor corriente de mercado de todas las garantías excedentes. El

monto total debe imputarse en la primera banda.

(11) Sumatoria del valor corriente de mercado de garantías no reclamadas. El

monto total debe imputarse en la primera banda.

(12) Sumatoria del valor corriente de mercado de todas las garantías ALAC que

puedan sustituirse por garantías no ALAC. El monto total debe imputarse en la

primera banda.

(13) Flujos de efectivo, asociados a los a mecanismos de compensación, threshold

o liquidación, que se estime a partir de un deterioro futuro. Ese deterioro se

estimará aplicando dos desviaciones estándar al valor razonable de cada contrato

derivado.

(14) Requerimiento adicional de liquidez en contratos con opcionalidad o

covenants asociados a la clasificación de crédito del banco. El banco deberá

estimar estos montos asumiendo un deterioro de la clasificación de largo y corto

plazo de 3 niveles. El monto total estimado deberá ser asignado en la primera

banda.

Tabla 87 - hoja 6

(15) Flujo contractual. Si los activos entregados en pacto son computados en

otra categoría, el flujo debe ser computado en términos brutos; en caso

contrario, en términos netos.

(16) Flujo contractual. Si los activos entregados en garantía son computados en

otra categoría, el flujo debe ser computado en términos brutos; en caso

contrario, en términos netos. Los flujos de garantías entregadas y recibidas por

el banco, deberán computarse netas en la medida que las garantías recibidas

estén a libre disposición y el banco pueda enajenarlas.

Tabla 88

Tabla 88: Ponderadores según categorías y bandas temporales de activos y flujos

(para la medición de las razones de liquidez)

.

Tabla 88 - hoja 2

.

Tabla 88 - hoja 3

.

(*) Tratándose de partidas de ingresos, sin vencimiento contractual (código 1 en

Tabla 84 de este Manual), los correspondientes flujos de efectivo recibirán el

ponderador de la última banda temporal, mientras que los flujos de egreso

recibirán el ponderador de la primera banda temporal.

(**) Para los flujos de efectivo en bandas temporales mayores a los 30 días se

aplicará un ponderador igual a 0%.

ARCHIVOS MAGNÉTICOS

Catálogo de archivos hoja 1

CATÁLOGO DE ARCHIVOS DEL SISTEMA DE INFORMACIÓN

SISTEMA CONTABLE

.

(1) El archivo C08 "semanal" (uno o dos en la semana, según corresponda) incluye

información individual referida a los días 4, 8, 12, 16, 20, 24, 28 y último día

de cada mes, en tanto que el de periodicidad mensual incluye información

consolidada referida al último día de cada mes. Este archivo deberá ser remitido

hasta la información referida al último día del mes de marzo de 2016.

(2) Tercer día hábil bancario siguiente al día 8 de cada mes, en que concluye el

periodo de encaje.

(3) El archivo C44 solo debe ser enviado por aquellos bancos que mantengan

depósitos a la vista y a plazo en el exterior, en entidades financieras

vinculadas directa o indirectamente con su estructura de propiedad o gestión.

Para estos efectos, la sucursal del banco en el exterior no se considera

relacionada.

ARCHIVOS MAGNÉTICOS

Catálogo de archivos hoja 2

.

(1) El archivo C46 "semanal" (uno o dos en la semana, según corresponda) incluye

información individual y consolidada local referida a los días 4, 8, 12, 16, 20,

24, 28 y último día de cada mes; en tanto que el de periodicidad mensual incluye

información consolidada global referida al último día de cada mes. Este archivo

deberá ser remitido a partir de la información que se genere en el mes de

diciembre de 2015.

(2) El archivo C47 "semanal" (uno o dos en la semana, según corresponda) incluye

información individual y consolidada local referida a los días 8, 16, 24 y

último día de cada mes; en tanto que el de periodicidad mensual incluye

información consolidada global referida al último día de cada mes. Este archivo

deberá ser remitido a partir de la información que se genere en el mes de marzo

de 2016.

(3) El archivo C48 "semanal" (uno o dos en la semana, según corresponda) incluye

información individual y consolidada local referida a los días pares y último

día de cada mes; en tanto que el de periodicidad mensual incluye información

consolidada global referida al último día de cada mes. Este archivo deberá ser

remitido a partir de la información que se genere en el mes de marzo de 2016.

ARCHIVOS MAGNÉTICOS

Catálogo de archivos hoja 3

SISTEMA DEUDORES

.

(1) Entregar en el curso de la mañana del día hábil bancario siguiente.

(2) Estos archivo lo enviarán sólo los bancos que tengan los créditos que se

exige informar.

(3) Sin periodicidad. Los archivos se enviarán sólo en la oportunidad en que se

soliciten.

(4) El archivo D43 se enviará sólo si existieron los remates o daciones en pago

que se deben informar, y el plazo para su envío será indicado en la respectiva

solicitud.

(5) Período de vigencia de una Tasa Máxima Convencional (TMC) determinada, es

decir, desde el día de su publicación y hasta el día anterior al de publicación

de la TMC siguiente.

Archivos no aplicables a bancos:

.

Se mantienen en este Manual las instrucciones de estos archivos solamente como

información para las cooperativas de ahorro y crédito que deben seguir

utilizándolos.

ARCHIVOS MAGNÉTICOS

Catálogo de archivos hoja 4

SISTEMA PRODUCTOS

.

(1) No deben enviar este archivo las instituciones financieras que los

proporcionen a través de la respectiva empresa operadora.

(2) Este archivo lo enviarán sólo aquellas instituciones que tenga sitio Web.

(3) Este archivo lo enviarán aquellas instituciones que mantengan colocaciones

de bonos hipotecarios

ARCHIVOS MAGNÉTICOS

Catálogo de archivos hoja 5

SISTEMA INSTITUCIONES

.

(1): Debe remitirse cada vez que ocurra un cambio en los datos del último

archivo enviado.

SISTEMA ESTADÍSTICO

.

ARCHIVO C40

CODIGO : C40

NOMBRE : FLUJOS ASOCIADOS A LOS RIESGOS DE TASA DE INTERES Y DE

REAJUSTABILIDAD EN EL LIBRO DE BANCA

SISTEMA : Contable

PERIODICIDAD : Mensual

PLAZO : 9 días hábiles

En este archivo se informarán los flujos calculados al último día de cada mes,

para el cómputo de la relación de operaciones activas y pasivas, según la

metodología de que trata el Capítulo III.B.2.2 del Compendio de Normas

Financieras del Banco Central de Chile y el Capítulo 12-21 de la Recopilación

Actualizada de Normas.

PRIMER REGISTRO

.

### 1. CODIGO DE LA IF

Corresponde a la identificación de la institución financiera según la

codificación dada por esta Superintendencia.

### 2. IDENTIFICACION DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "C40".

### 3. PERIODO

Corresponde al mes (AAAAMM) a que se refiere la información.

REGISTROS SIGUIENTES

Los registros siguientes contendrán información de distinta índole, por lo cual

en el primer campo de cada registro se identificará de qué información se trata,

según los siguientes códigos:

Código Tipo de registro (contenido)

01 Patrimonio efectivo.

02 Margen.

Archivo C40 / hoja 2

03 Exposición de corto plazo al riesgo de tasa de interés.

04 Exposición al riesgo de reajustabilidad.

05 Menor ingreso por comisiones sensible a las tasas de interés.

06 Exposición de largo plazo al riesgo de tasa de interés.

07 Exposición al riesgo de opciones sobre tasas de interés.

08 Límites.

09 Detalle de flujos asignables a las bandas temporales.

10 Detalle de comisiones sensibles a las tasas de interés.

11 Detalle de opciones sobre tasas de interés.

12 Detalle de exposiciones al riesgo de reajustabilidad.

Registro para indicar el patrimonio efectivo:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "01".

### 2. PATRIMONIO EFECTIVO

Monto del patrimonio efectivo correspondiente al día a que se refiere la

información.

Registro para indicar el margen:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "02".

2 - MARGEN.

Corresponde a la diferencia entre los ingresos y gastos por intereses y

reajustes acumulados en los últimos 12 meses, más los ingresos netos por

aquellas comisiones sensibles a la tasa de interés a que se refiere el numeral

1.3 del Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco Central

de Chile, acumulados en los últimos doce meses.

Archivo C40 / hoja 3

Registro para indicar la exposición al riesgo de tasa de interés del Libro de

Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "03".

2. EXPOSICION DE CORTO PLAZO AL RIESGO DE TASA DE INTERES EN EL LIBRO DE BANCA.

Corresponde al resultado obtenido al aplicar el primer término de la primera

ecuación indicada en el numeral 1.2 del Anexo 1 del Capítulo III.B.2.2 del

Compendio de Normas Financieras del Banco Central de Chile, considerando las

precisiones contenidas en los numerales 1.3 y 3 de dicho anexo y en el Capítulo

12-21 de la Recopilación Actualizada de Normas.

Registro para indicar la exposición al riesgo de reajustabilidad en el Libro de

Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "04".

### 2. EXPOSICION AL RIESGO DE REAJUSTABILIDAD EN EL LIBRO DE BANCA

Corresponde al resultado obtenido al aplicar el segundo término de la primera

ecuación indicada en el numeral 1.2 Anexo 1 del Capítulo III.B.2.2 del Compendio

de Normas Financieras del Banco Central de Chile, considerando lo dispuesto en

los numerales 1.3 y 3 de dicho anexo y las precisiones contenidas en el Capítulo

12-21 de la Recopilación Actualizada de Normas.

Archivo C40 / hoja 4

Registro para indicar el menor ingreso por comisiones sensible a las tasas de

interés:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "05".

### 2. MENOR INGRESO POR COMISIONES SENSIBLE A LAS TASAS DE INTERES

Corresponde al tercer término de la primera ecuación indicada en el numeral 1.2

del Anexo 1 del Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco

Central de Chile, considerando lo dispuesto en el número iii) del numeral 1.3 de

dicho anexo y las precisiones del Capítulo 12-21 de la Recopilación Actualizada

de Normas.

Registro para indicar la exposición de largo plazo al riesgo de tasa de interés

en el Libro de Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "06".

2. EXPOSICION DE LARGO PLAZO AL RIESGO DE TASA DE INTERES EN EL LIBRO DE BANCA.

Corresponde al resultado obtenido al aplicar la segunda ecuación indicada en el

numeral 1.2 del Anexo 1 del Capítulo III.B.2.2 del Compendio de Normas

Financieras del Banco Central de Chile.

Archivo C40 / hoja 5

Registro para indicar la exposición de opciones sobre tasas de interés en el

Libro de Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "07".

2. EXPOSICION AL RIESGO DE OPCIONES SOBRE TASAS DE INTERES EN EL LIBRO DE BANCA.

Corresponde a la exposición al riesgo de mercado de las posiciones en opciones

sobre tasas de interés en el Libro de Banca, calculada según lo dispuesto en el

numeral 4.1 ó 4.2 del Anexo 1 del Capítulo III.B.2.2 del Compendio de Normas

Financieras del Banco Central, según corresponda, considerando lo indicado en el

numeral 3 de dicho anexo.

Registro para indicar los límites a las exposiciones de corto y largo plazo:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "08".

2. LIMITE A LA EXPOSICION DE CORTO PLAZO A LOS RIESGOS DE TASAS DE INTERES Y DE

REAJUSTABILIDAD EN EL LIBRO DE BANCA.

La exposición de corto plazo a los riesgos de tasas de interés y de

reajustabilidad en el Libro de Banca debe medirse conforme lo indicado en la

primera ecuación del numeral 1.2 del Anexo 1 del Capítulo III.B.2.2 del

Compendio de Normas Financieras del Banco Central de Chile. El límite que haya

sido fijado para dicha exposición debe informarse como un porcentaje de la

diferencia entre los ingresos y gastos por intereses y reajustes acumulados más

los ingresos netos por comisiones sensibles a la tasa de interés a que se

refiere dicho anexo, acumulados en los últimos doce meses.

Archivo C40 / hoja 6

3. LIMITE A LA EXPOSICION DE LARGO PLAZO AL RIESGO DE TASAS DE INTERES EN EL

LIBRO DE BANCA.

La exposición de largo plazo al riesgo de tasas de interés en el Libro de Banca

debe medirse conforme lo indicado en la segunda ecuación del numeral 1.2 del

Anexo 1 del Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco

Central de Chile, incluyendo el riesgo de opciones sobre tasas de interés o

instrumentos de deuda en el Libro de Banca. El límite que se haya fijado para

dicha exposición debe informarse como un porcentaje del patrimonio efectivo.

Registros para el cálculo del riesgo de tasas de interés en el Libro de Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "09".

### 2. TIPO DE TASA DE INTERES

Se identificará con los siguientes códigos:

Código Tipo de tasa

1 Para operaciones con tasas fijas y saldos no sujetos a interés

2 Para operaciones con tasa flotante

### 3. TIPO DE FLUJO INFORMADO

Se utilizarán los siguientes códigos para identificar los flujos que se

informan:

Código Tipo de flujo

1 Para los flujos de capital

2 Para los flujos de intereses

Archivo C40 / hoja 7

### 4. MONEDA

Corresponde al código de moneda extranjera de pago o tipo de reajustabilidad

según la Tabla 1. Para operaciones pagaderas en pesos reajustables en moneda

extranjera (incluidas las expresadas en moneda extranjera y pagaderas en pesos),

se utilizará el código correspondiente a la moneda extranjera de que se trate y

no el código que identifica el tipo de reajustabilidad.

### 5. ORIGEN DEL FLUJO

Se utilizarán los siguientes códigos:

Código Origen de los flujos

Para el disponible:

001 Disponible

Para colocaciones no asociadas al uso de líneas de crédito y de sobregiros:

111 Créditos comerciales (excluidos los indicados en los códigos

siguientes)

112 Compras con pacto de reventa

119 Operaciones de leasing comercial

121 Créditos hipotecarios de vivienda en letras de crédito

122 Créditos hipotecarios de vivienda con mutuos hipotecarios endosables

123 Otros créditos hipotecarios de vivienda

129 Leasing para vivienda

131 Créditos de consumo

139 Leasing de consumo

Para colocaciones asociadas al uso de líneas de crédito y de sobregiros:

211 Créditos comerciales

231 Créditos de consumo

Para instrumentos financieros no derivados

301 Banco Central de Chile

302 Gobierno de Chile

303 Bancos e instituciones financieras del país

304 Otras entidades del país

305 Gobiernos y entidades gubernamentales extranjeros

306 Bancos del exterior

307 Otras entidades extranjeras

Para posiciones activas en derivados:

351 Forwards

352 Futuros

353 Swaps

354 Otros, excepto opciones

Para otros activos

390 Otros activos

Archivo C40 / hoja 8

Para depósitos y captaciones:

401 Depósitos a la vista

403 Depósitos a plazo

404 Cuentas de ahorro con giro diferido

405 Cuentas de ahorro con giro incondicional

409 Ventas con pacto de recompra

Para préstamos y otras obligaciones

420 Préstamos y otras obligaciones contraídas en el país

425 Préstamos y otras obligaciones contraídas en el exterior

Para instrumentos de deuda emitidos

431 Letras de crédito

432 Bonos corrientes

433 Bonos subordinados

Para posiciones pasivas en derivados:

451 Forwards

452 Futuros

453 Swaps

454 Otros, excepto opciones

Para otros pasivos

490 Otros pasivos

Para posiciones delta ponderada de opciones sobre tasas de interés e

instrumentos de deuda:

601 Posición delta ponderada activa de opciones sobre tasas de interés e

instrumentos de deuda (método intermedio) – Libro de Banca.

602 Posición delta ponderada pasiva de opciones sobre tasas de interés e

instrumentos de deuda (método intermedio) – Libro de Banca.

Los códigos correspondientes a colocaciones incluyen tanto las vigentes como las

vencidas.

Los instrumentos financieros no derivados corresponden a instrumentos no

derivados incluidos en el Libro de Banca.

Con el código "401" se informarán las acreencias a la vista por concepto de

depósitos, cuentas de ahorro y otras obligaciones, en tanto que con el código

"403" se incluirán las acreencias a plazo con excepción de las indicadas con

otros códigos.

Los códigos "351" a "354" y "451" a "454" se refieren a derivados, excepto

opciones, incluidos en el Libro de Banca. Deberán ser separados en los flujos

asociados a los subyacentes respectivos y asignados a las bandas temporales que

correspondan.

Archivo C40 / hoja 9

La posición delta ponderada de opciones sobre tasas de interés o instrumentos de

deuda (Códigos "601" o "602") corresponde a opciones sobre tasas de interés o

instrumentos de deuda, incluidas en el Libro de Banca. Debe ser computada

conforme lo indicado en el numeral 4.2.1 del Anexo N° 1 del Capítulo III.B.2.2

del Compendio de Normas Financieras del Banco Central de Chile.

### 6. BANDA TEMPORAL

Se utilizarán los códigos que se indican para identificar las bandas temporales

correspondientes a la Tabla 2 del Anexo N° 1 del Capítulo III.B.2.2 del

Compendio de Normas Financieras del Banco Central de Chile, las que informarán

los flujos según su vencimiento:

Código Banda temporal (plazos)

01 Disponible hasta 1 mes

02 1-3 meses

03 3-6 meses

04 6-9 meses

05 9 meses - 1 año

06 1-2 años

07 2-3 años

08 3-4 años

09 4-5 años

10 5-7 años

11 7-10 años

12 10-15 años

13 15-20 años

14 más de 20 años

### 7. MONTO DEL FLUJO

Se debe informar el monto que corresponda de acuerdo con los campos anteriores.

Registros para el cálculo del menor ingreso neto por comisiones sensibles a

cambios en las tasas de interés:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "10".

Archivo C40 / hoja 10

### 2. MONEDA

Corresponde al código de moneda extranjera de pago o tipo de reajustabilidad

según la Tabla 1. Para operaciones pagaderas en pesos reajustables en moneda

extranjera (incluidas las expresadas en moneda extranjera y pagaderas en pesos),

se utilizará el código correspondiente a la moneda extranjera de que se trate y

no el código que identifica el tipo de reajustabilidad.

### 3. ORIGEN DE LA COMISION

Identifica si las comisiones sensibles a cambios en la tasa de interés a que se

refiere el Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco

Central de Chile guardan relación con operaciones activas o pasivas, según:

Código Origen de la comisión

1 Operaciones activas

2 Operaciones pasivas

### 4. MONTO NETO DE LA COMISION

Se debe informar el monto neto que corresponda de acuerdo con los campos

anteriores.

Registros para el cálculo del riesgo de opciones sobre tasas de interés

(exclusive delta ponderado) en el Libro de Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "11".

### 2. TIPO DE TASA DE INTERES

Se identificará con los siguientes códigos:

Código Tipo de tasa

1 Para operaciones con tasas fijas

2 Para operaciones con tasa flotante

Archivo C40 / hoja 11

### 3. MONEDA

Corresponde al código de moneda extranjera de pago o tipo de reajustabilidad

según la Tabla 1. Para operaciones pagaderas en pesos reajustables en moneda

extranjera (incluidas las expresadas en moneda extranjera y pagaderas en pesos),

se utilizará el código correspondiente a la moneda extranjera de que se trate y

no el código que identifica el tipo de reajustabilidad.

### 4. COMPONENTE DEL RIESGO DE OPCIONES

Se utilizarán los siguientes códigos:

Código Componente

1 Riesgo gamma de opciones sobre tasas de interés e instrumentos de

deuda (método intermedio)

2 Riesgo vega de opciones sobre tasas de interés e instrumentos de deuda

(método intermedio)

3 Exposición de opciones sobre tasas de interés e instrumentos de deuda

(método simplificado)

El riesgo gamma de opciones sobre tasas de interés e instrumentos de deuda

corresponde a los impactos gamma de las opciones sobre tasas de interés o

instrumentos de deuda incluidas en el Libro de Banca, calculados conforme lo

indicado en el numeral 4.2.2 Anexo N° 1 del Capítulo III.B.2.2 del Compendio de

Normas Financieras del Banco Central de Chile.

El riesgo vega de opciones sobre tasas de interés e instrumentos de deuda

corresponde a los impactos vega de opciones sobre tasas de interés o

instrumentos de deuda incluidas en el Libro de Banca, calculados conforme lo

indicado en el numeral 4.2.3 Anexo N° 1 del Capítulo III.B.2.2 del Compendio de

Normas Financieras del Banco Central de Chile.

La exposición de opciones sobre tasas de interés e instrumentos de deuda (método

simplificado) corresponde al riesgo de mercado de posiciones largas en opciones

sobre tasas de interés o instrumentos de deuda incluidas en Libro de Banca,

calculada conforme lo indicado en el numeral 4.1 Anexo N° 1 del Capítulo

III.B.2.2 del Compendio de Normas Financieras del Banco Central de Chile.

### 5. MONTO DE LA EXPOSICION

Se debe informar el monto que corresponda de acuerdo con los campos anteriores.

Archivo C40 / hoja 12

Registros para el cálculo del riesgo de reajustabilidad en el Libro de Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "12".

### 2. ORIGEN DE LA EXPOSICION

Identifica el origen de la exposición al riesgo de reajustabilidad, por aquellas

posiciones en el Libro de Banca en moneda chilena reajustable (UF, IVP, UTM o

IPC, tratadas como una sola moneda). Se utilizarán los siguientes códigos:

Código Tipo de flujo

01 Activos reajustables (incluida posiciones en derivados sobre UF)

02 Pasivos reajustables (incluida posiciones en derivados sobre UF)

El código "01" incluye todos los activos reajustables correspondientes al Libro

de Banca, incluidas las posiciones activas en derivados sobre UF del Libro de

Banca.

El código "02" incluye todos los pasivos reajustables, incluidas las posiciones

pasivas en derivados sobre UF del Libro de Banca.

### 3. MONTO DE LA EXPOSICION

Se debe informar el monto que corresponda de acuerdo con los campos anteriores.

Al tratarse de posiciones activas o pasivas en derivados, debe informarse el

valor razonable de las posiciones.

Archivo C40 / hoja 13

Carátula de cuadratura

El archivo C40 debe entregarse con una carátula de cuadratura cuyo modelo se

especifica a continuación.

MODELO

.

ARCHIVO C41

CODIGO : C41

NOMBRE : INFORMACION SEMANAL SOBRE RIESGOS DE MERCADO SEGUN METODOLOGIA

ESTANDARIZADA.

SISTEMA : Contable.

PERIODICIDAD : Semanal, referida a cada uno de los días hábiles bancarios de la

semana anterior a la fecha de envío.

PLAZO : 3 días hábiles (tercer día hábil de la semana siguiente).

En este archivo se informarán los flujos para el cómputo de la relación de

operaciones activas y pasivas, según medición estándar, de que trata el Capítulo

III.B.2.2 del Compendio de Normas Financieras del Banco Central de Chile y el

Capítulo 12-21 de la Recopilación Actualizada de Normas.

El archivo deben enviarlo solamente los bancos que no utilizan modelos propios

para fines de determinar el límite normativo de que trata el numeral 1.6 del

Capítulo III.B.2.2 antes mencionado, incluyendo la información diaria de lunes a

viernes, con excepción de los feriados.

PRIMER REGISTRO

.

### 1. CODIGO DE LA IF

Corresponde a la identificación de la institución financiera según la

codificación dada por esta Superintendencia.

### 2. IDENTIFICACION DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "C41".

### 3. FECHA DE IDENTIFICACION DEL ARCHIVO

Corresponde a la fecha del último día hábil de la semana cuya información diaria

se informa (última fecha a la que se refiere la información).

Archivo C41 / hoja 2

REGISTROS SIGUIENTES

Los registros siguientes contendrán información de distinta índole, por lo cual

en el primer campo de cada registro se identificará de qué información se trata,

según los siguientes códigos:

Código Tipo de registro (contenido)

01 Patrimonio efectivo.

02 Activos ponderados por riesgo.

03 Exposición al riego de tasa de interés del Libro de Negociación.

04 Exposición al riesgo de moneda en el Libro de Negociación y en el

Libro de Banca.

05 Riesgo de opciones sobre tasa de interés en el Libro de Negociación.

06 Riesgo de opciones sobre monedas en el Libro de Negociación y en el

Libro de Banca.

07 Detalle de flujos asignables a bandas temporales.

08 Detalle de opciones sobre tasas de interés.

09 Detalle de exposiciones en monedas.

Por otra parte, en el segundo campo de cada uno de los registros se incluirá la

fecha a la cual se refiere la información que contiene el registro.

Registros para indicar el patrimonio efectivo:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "01".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

Archivo C41 / hoja 3

3 PATRIMONIO EFECTIVO:

Monto del patrimonio efectivo correspondiente a la fecha indicada en el campo

anterior.

Cuando no disponga aún del dato del patrimonio efectivo correspondiente al

último día de un mes o a los primeros días del mes siguiente, se incluirá el

monto de patrimonio efectivo informado para el último día de la semana anterior.

Si hubiera un aumento (o disminución) de capital pagado en la semana que se

informa, se agregará (o deducirá) de ese monto.

Registros para indicar el monto de los activos ponderados por riesgo:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "02".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

3 ACTIVOS PONDERADOS POR RIESGO.

Corresponde al monto de los activos ponderados por riesgo según lo indicado en

el Capítulo 12-1 de la Recopilación Actualizada de Normas, correspondiente al

día indicado en el campo anterior. Dado que el monto de los activos ponderados

por riesgo depende de ajustes contables que normalmente se efectúan al cierre de

cada mes (provisiones), si el banco no dispone de los medios para estimar los

montos correspondientes a cada día, podrá incluir en los respectivos registros

los de la última información mensual disponible.

Registros para indicar la exposición al riesgo de tasa de interés en el Libro de

Negociación:

.

Archivo C41 / hoja 4

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "03".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

3 EXPOSICION AL RIESGO DE TASAS DE INTERES EN EL LIBRO DE NEGOCIACION.

Corresponde al resultado obtenido conforme lo indicado en el numeral 1.1 del

Anexo N°1 del Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco

Central de Chile, considerando lo dispuesto en el numeral 3 de dicho anexo y en

el Capítulo 12-21 de la Recopilación Actualizada de Normas.

Registros para indicar la exposición al riesgo de moneda en el Libro de

Negociación y en el Libro de Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "04".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

3 EXPOSICION AL RIESGO DE MONEDAS EN EL LIBRO DE NEGOCIACION Y EN EL LIBRO DE

BANCA.

Corresponde al resultado obtenido conforme lo indicado en el numeral 2 del Anexo

N° 1 Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco Central de

Chile, considerando lo dispuesto en el numeral 3 de dicho anexo y en el Capítulo

12-21 de la Recopilación Actualizada de Normas.

Registros para indicar el riesgo de opciones sobre tasa de interés en el Libro

de Negociación:

.

Archivo C41 / hoja 5

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "05".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

3 RIESGO DE OPCIONES SOBRE TASAS DE INTERES EN EL LIBRO DE NEGOCIACION.

Corresponde a la exposición al riesgo de mercado de posiciones en opciones sobre

tasas de interés incluidas en el Libro de Negociación. Dicha exposición debe

calcularse conforme a lo indicado en los numerales 4.1 ó 4.2 del Anexo N° 1 del

Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco Central de

Chile, según corresponda.

Registros para indicar el riesgo de opciones sobre monedas en el Libro de

Negociación y en el Libro de Banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "06".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

3 RIESGO DE OPCIONES SOBRE MONEDAS EN EL LIBRO DE NEGOCIACION Y EN EL LIBRO DE

BANCA.

Corresponde a la exposición al riesgo de mercado de las posiciones en opciones

sobre monedas en el Libro de Negociación y en el Libro de Banca, calculada según

los dispuesto en el numeral 4.1 ó 4.2 del Anexo 1 del Capí- tulo III.B.2.2 del

Compendio de Normas Financieras del Banco Central de Chile, según corresponda.

Archivo C41 / hoja 6

Registros para el cálculo del riesgo de tasa de interés en el Libro de

Negociación:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "07".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

### 3. TIPO DE TASA DE INTERES

Se identificará con los siguientes códigos:

Código Tipo de tasa

1 Para operaciones con tasas fijas y saldos no sujetos a interés

2 Para operaciones con tasa flotante

### 4. TIPO DE FLUJO INFORMADO

Se utilizarán los siguientes códigos para identificar los flujos que se

informan:

Código Tipo de flujo

1 Para los flujos de capital

2 Para los flujos de intereses

### 5. MONEDA

Corresponde al código de moneda extranjera de pago o tipo de reajustabilidad

según la Tabla 1. Para operaciones pagaderas en pesos reajustables en moneda

extranjera (incluidas las expresadas en moneda extranjera y pagaderas en pesos),

se utilizará el código correspondiente a la moneda extranjera de que se trate y

no el código que identifica el tipo de reajustabilidad.

Archivo C41 / hoja 7

### 6. ORIGEN DEL FLUJO

Identifica el tipo de posición en el Libro de Negociación que origina los

flujos. Se utilizarán los siguientes códigos:

Código Origen de los flujos

Para instrumentos financieros no derivados:

301 Banco Central de Chile

302 Gobierno de Chile

303 Bancos e instituciones financieras del país

304 Otras entidades del país

305 Gobiernos y entidades gubernamentales extranjeros

306 Bancos del exterior

307 Otras entidades extranjeras

Para posiciones activas en derivados:

351 Forwards

352 Futuros

353 Swaps

354 Otros, excepto opciones

Para posiciones pasivas en derivados:

451 Forwards

452 Futuros

453 Swaps

454 Otros, excepto opciones

Para posiciones delta ponderada de opciones sobre tasas de interés e

instrumentos de deuda:

603 Posición delta ponderada activa de opciones sobre tasas de interés e

instrumentos de deuda (método intermedio) – Libro de Negociación.

604 Posición delta ponderada pasiva de opciones sobre tasas de interés e

instrumentos de deuda (método intermedio) – Libro de Negociación.

Los instrumentos financieros no derivados corresponden sólo a aquellas

posiciones en instrumentos no derivados registrados en el activo por su valor

razonable que no presenten restricciones de ninguna naturaleza que puedan

impedir que sean negociados y que: (i) se mantengan en cartera para negociarlos

en el corto plazo con el propósito de obtener ganancias provenientes del

arbitraje o de fluctuaciones esperadas en los precios o tasas de mercado; o que

(ii) formen parte de una cartera de instrumentos que se negocian activa y

frecuentemente por la institución.

Archivo C41 / hoja 8

Los códigos "351" a "354" y "451" a "454" se refieren a derivados, excepto

opciones, incluidos en el Libro de Negociación. Deberán ser separados en los

flujos asociados a los subyacentes respectivos y asignados a las bandas

temporales que correspondan.

La posición delta ponderada de opciones sobre tasas de interés o instrumentos de

deuda (Códigos "601" o "602") corresponde a la posición en opciones sobre tasas

de interés o instrumentos de deuda, incluidas en el Libro de Negociación. Debe

ser computada conforme lo indicado en el numeral 4.2.1 del Anexo N° 1 del

Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco Central de

Chile.

### 7. BANDA TEMPORAL

Se utilizarán los códigos que se indican para identificar las bandas temporales

correspondientes a la Tabla 2 del Anexo N° 1 del Capítulo III.B.2.2 del

Compendio de Normas Financieras del Banco Central de Chile, las que informarán

los flujos según su vencimiento:

Código Banda temporal (plazos)

01 Disponible hasta 1 mes

02 1-3 meses

03 3-6 meses

04 6-9 meses

05 9 meses - 1 año

06 1-2 años

07 2-3 años

08 3-4 años

09 4-5 años

10 5-7 años

11 7-10 años

12 10-15 años

13 15-20 años

14 más de 20 años

### 8. MONTO DEL FLUJO

Se debe informar el monto que corresponda de acuerdo con los campos anteriores.

Registros para el cálculo del riesgo de opciones sobre tasa de interés

(exclusive delta ponderado) en el Libro de Negociación:

.

Archivo C41 / hoja 9

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "08".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

### 3. TIPO DE TASA DE INTERES

Se identificará con los siguientes códigos:

Código Tipo de tasa

1 Para operaciones con tasas fijas y saldos no sujetos a interés

2 Para operaciones con tasa flotante

### 4. MONEDA

Corresponde al código de moneda extranjera de pago o tipo de reajustabilidad

según la Tabla 1. Para operaciones pagaderas en pesos reajustables en moneda

extranjera (incluidas las expresadas en moneda extranjera y pagaderas en pesos),

se utilizará el código correspondiente a la moneda extranjera de que se trate y

no el código que identifica el tipo de reajustabilidad.

### 5. COMPONENTE DEL RIESGO DE OPCIONES

Se utilizarán los siguientes códigos:

Código Componente

1 Riesgo gamma de opciones sobre tasas de interés e instrumentos de

deuda (método intermedio).

2 Riesgo vega de opciones sobre tasas de interés e instrumentos de deuda

(método intermedio)

3 Exposición de opciones sobre tasas de interés e instrumentos de deuda

(método simplificado).

El riesgo gamma de opciones sobre tasas de interés e instrumentos de deuda

(Código "1") corresponde a los impactos gamma de las opciones sobre tasas de

interés o instrumentos de deuda incluidas en el Libro de Banca, calculados

conforme lo indicado en el numeral 4.2.2 Anexo N° 1 del Capítulo III.B.2.2 del

Compendio de Normas Financieras del Banco Central de Chile.

El riesgo vega de opciones sobre tasas de interés e instrumentos de deuda

(Código "2") corresponde a los impactos vega de opciones sobre tasas de interés

o instrumentos de deuda incluidas en el Libro de Banca, calculados conforme lo

indicado en el numeral 4.2.3 Anexo N° 1 del Capítulo III.B.2.2 del Compendio de

Normas Financieras del Banco Central de Chile.

Archivo C41 / hoja 10

La exposición de opciones sobre tasas de interés e instrumentos de deuda (Código

"3") corresponde al riesgo de mercado de posiciones largas en opciones sobre

tasas de interés o instrumentos de deuda incluidas en Libro de Banca, calculada

conforme lo indicado en el numeral 4.1 Anexo N° 1 del Capítulo III.B.2.2 del

Compendio de Normas Financieras del Banco Central de Chile.

### 6. MONTO DE LA EXPOSICION

Se debe informar el monto que corresponda de acuerdo con los campos anteriores.

Registros para el cálculo del riesgo de moneda en los libros de negociación y de

banca:

.

### 1. TIPO DE REGISTRO

Corresponde al código que identifica el tipo de registro. Debe ser "09".

### 2. FECHA

Corresponde a la fecha a la cual se refiere la información del registro.

### 3. MONEDA EXTRANJERA

Corresponde a código de moneda extranjera según Tabla 1. Para operaciones

pagaderas en pesos reajustables en moneda extranjera (incluidas las expresadas

en moneda extranjera y pagaderas en pesos), se utilizará el código

correspondiente a la moneda extranjera de que se trate y no el código que

identifica el tipo de reajustabilidad. Para informar el Capital D.L 600 y las

utilidades remesables D.L. 600, se incluirá el código de la moneda en que se

realizaron los aportes de capital.

### 4. ORIGEN DE LA EXPOSICION

Identifica el tipo de exposición en moneda extranjera en el Libro de Negociación

y en Libro de Banca. Se utilizarán los siguientes códigos:

Código Origen de la exposición

Para el disponible:

001 Disponible

Archivo C41 / hoja 11

Para colocaciones no asociadas al uso de líneas de crédito y de sobregiros:

111 Créditos comerciales (excluidos los indicados en los códigos

siguientes)

112 Compras con pacto de reventa

119 Operaciones de leasing comercial

121 Créditos hipotecarios de vivienda en letras de crédito

122 Créditos hipotecarios de vivienda con mutuos hipotecarios endosables

123 Otros créditos hipotecarios de vivienda

129 Leasing para vivienda

131 Créditos de consumo

139 Leasing de consumo

Para colocaciones asociadas al uso de líneas de crédito y de sobregiros:

211 Créditos comerciales

231 Créditos de consumo

Para instrumentos financieros no derivados

301 Banco Central de Chile

302 Gobierno de Chile

303 Bancos e instituciones financieras del país

304 Otras entidades del país

305 Gobiernos y entidades gubernamentales extranjeros

306 Bancos del exterior

307 Otras entidades extranjeras

Para posiciones activas en derivados:

351 Forwards

352 Futuros

353 Swaps

354 Otros, excepto opciones

Para otros activos

390 Otros activos

Para depósitos y captaciones:

401 Depósitos a la vista

403 Depósitos a plazo

404 Cuentas de ahorro con giro diferido

405 Cuentas de ahorro con giro incondicional

409 Ventas con pacto de recompra

Para préstamos y otras obligaciones

420 Préstamos y otras obligaciones contraídas en el país

425 Préstamos y otras obligaciones contraídas en el exterior

Para instrumentos de deuda emitidos

431 Letras de crédito

432 Bonos corrientes

433 Bonos subordinados

Archivo C41 / hoja 12

Para posiciones pasivas en derivados:

451 Forwards

452 Futuros

453 Swaps

454 Otros, excepto opciones

Para otros pasivos

490 Otros pasivos

Para exposición de opciones sobre monedas

500 Exposición de opciones sobre monedas (método simplificado)

Para posiciones delta ponderada de opciones sobre monedas:

701 Posición delta ponderada activa de opciones sobre monedas (método

intermedio).

702 Posición delta ponderada pasiva de opciones sobre monedas (método

intermedio)

Para riesgo gamma y vega

801 Riesgo gamma de opciones sobre monedas (método intermedio).

802 Riesgo vega de opciones sobre monedas (método intermedio).

Para saldos D.L. 600

901 Aportes de capital DL 600.

902 Utilidades retenidas remesables DL 600.

Los códigos correspondientes a colocaciones incluyen tanto las vigentes como las

vencidas.

Los instrumentos financieros no derivados corresponden a la posición pagadera o

reajustable en moneda extranjera en instrumentos financieros no derivados

incluidos en el Libro de Negociación y en el Libro de Banca.

Con el código "401" se informarán las acreencias a la vista por concepto de

depósitos, cuentas de ahorro y otras obligaciones, en tanto que con el código

"403" se incluirán las acreencias a plazo con excepción de las indicadas con

otros códigos.

Las posiciones en derivados (Códigos "351" a "354" y "451" a "454"),

corresponden a las de derivados, excluidas las opciones, incluidos en el Libro

de Negociación y en el Libro de Banca. Debe informarse el valor razonable de las

posiciones.

La exposición de opciones sobre monedas (método simplificado) que se informa con

el código "500", corresponde a la exposición en opciones sobre monedas

extranjeras incluidas en el Libro de Negociación y en el Libro de Banca,

calculada conforme lo indicado en el numeral 4.1 del Anexo N° 1 del Capítulo

III.B.2.2 del Compendio de Normas Financieras del Banco Central de Chile.

Archivo C41 / hoja 13

La posición delta ponderada de opciones sobre monedas (códigos "701" y "702")

corresponde a la posición en opciones sobre monedas extranjeras incluidas en el

Libro de Negociación y en el Libro de Banca, calculada conforme lo indicado en

el numeral 4.2.1 del Anexo N° 1 del Capítulo III.B.2.2 del Compendio de Normas

Financieras del Banco Central de Chile.

El riesgo gamma de opciones sobre monedas (Código "801") corresponde a los

impactos gamma de opciones sobre monedas extranjeras incluidas en el Libro de

Negociación y en el Libro de Banca, calculados conforme lo indicado en el

numeral 4.2.2 del Anexo N° 1 del Capítulo III.B.2.2 del Compendio de Normas

Financieras del Banco Central de Chile.

El riesgo vega de opciones sobre monedas (Código "802") corresponde a los

impactos vega de opciones sobre monedas extranjeras incluidas en el Libro de

Negociación y en el Libro de Banca, calculados conforme lo indicado en el

numeral 4.2.3 del Anexo N°1 del Capítulo III.B.2.2 del Compendio de Normas

Financieras del Banco Central de Chile.

### 5. MONTO DE LA EXPOSICION

Se debe informar el monto que corresponda de acuerdo con los campos anteriores.

Carátula de cuadratura

El archivo C41 debe entregarse con una carátula de cuadratura cuyo modelo se

especifica a continuación.

MODELO

.

ARCHIVO C42

CODIGO : C42

NOMBRE : INFORMACION MENSUAL SOBRE RIESGOS DE MERCADO SEGUN METODOLOGIA

ESTANDARIZADA.

SISTEMA : Contable.

PERIODICIDAD : Mensual.

PLAZO : 9 días hábiles.

En este archivo se informarán los flujos para el cómputo de la relación de

operaciones activas y pasivas, según medición estándar, de que trata el Capítulo

III.B.2.2 del Compendio de Normas Financieras del Banco Central de Chile y el

Capítulo 12-21 de la Recopilación Actualizada de Normas.

Este archivo deben enviarlo solamente los bancos que no utilizan la metodología

estandarizada para la determinación del límite normativo, a fin de mostrar la

situación sobre la base de esa metodología, referida al último día de cada mes.

PRIMER REGISTRO

.

### 1. CODIGO DE LA IF

Corresponde a la identificación de la institución financiera según la

codificación dada por esta Superintendencia.

### 2. IDENTIFICACION DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "C42".

### 3. PERIODO

Corresponde al mes (AAAAMM) al cual se refiere la información.

REGISTROS SIGUIENTES

Los registros siguientes corresponden a los instruidos para el archivo C41. En

este caso la fecha incluida en el segundo campo de cada registro corresponderá a

la del último día del mes que se informa.

Archivo C42 / hoja 2

Carátula de cuadratura

El archivo C42 debe entregarse con una carátula de cuadratura cuyo modelo se

especifica a continuación.

MODELO

.

ARCHIVO C43

CODIGO : C43

NOMBRE : INFORMACION CONSOLIDADA SOBRE RIESGOS DE MERCADO SEGUN

METODOLOGIA ESTANDARIZADA.

SISTEMA : Contable.

PERIODICIDAD : Mensual.

PLAZO : 9 días hábiles.

En este archivo se informarán los flujos consolidados del banco con sus

subsidiarias, referidos al último día de cada mes, para el cómputo de la

relación de operaciones activas y pasivas, según medición estándar, de que trata

el Capítulo III.B.2.2 del Compendio de Normas Financieras del Banco Central de

Chile y el Capítulo 12-21 de la Recopilación Actualizada de Normas.

PRIMER REGISTRO

.

### 1. CODIGO DE LA IF

Corresponde a la identificación de la institución financiera según la

codificación dada por esta Superintendencia.

### 2. IDENTIFICACION DEL ARCHIVO

Corresponde a la identificación del archivo. Debe ser "C43".

### 3. PERIODO

Corresponde al mes (AAAAMM) al cual se refiere la información.

REGISTROS SIGUIENTES

Los registros siguientes corresponden a los instruidos para el archivo C41. En

este caso la fecha incluida en el segundo campo de cada registro corresponderá a

la del último día del mes que se informa.

Archivo C43 / hoja 2

Carátula de cuadratura

El archivo C43 debe entregarse con una carátula de cuadratura cuyo modelo se

especifica a continuación.

MODELO

.