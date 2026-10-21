import { figure, linear, norm } from '../../src/index'

export const a = figure(fig => linear('Linear')(fig.input('x')))
export const b = figure(fig => norm()(fig.input('x')))
