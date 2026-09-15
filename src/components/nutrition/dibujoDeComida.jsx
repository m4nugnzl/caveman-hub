import { Apple, Coffee, Milk, Soup, Utensils, UtensilsCrossed } from 'lucide-react';

import { iconoDeComida } from '@/domain/dietSheet';

/*
  EL DIBUJO DE CADA COMIDA. La palabra la decide el dominio (`iconoDeComida`) y
  aquí solo se traduce a su icono, que es el reparto de siempre: el criterio en
  `domain`, el cromo en la pieza.

  Vivía dentro de `MealCard`. Sale porque lo piden dos: la hoja del entrenador y
  la comida del cliente (`Client/ComidaDelCliente`). No es adorno —es lo que deja
  localizar la cena de un vistazo en una lista de cuatro tarjetas iguales, que es
  justo lo que se hace con el pulgar a media mañana—, así que las dos tienen que
  dibujar lo mismo para la misma palabra.
*/
const DIBUJOS = {
  taza: Coffee,
  manzana: Apple,
  cuenco: Soup,
  plato: UtensilsCrossed,
  batido: Milk,
  cubierto: Utensils,
};

/** El icono que le toca al nombre que escribió el entrenador. */
export const dibujoDeComida = (nombre) => DIBUJOS[iconoDeComida(nombre)] || Utensils;
