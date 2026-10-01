import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmBadgeImports, type BadgeVariants } from '@spartan-ng/helm/badge';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { DAYS, dayStatus, padDay, type DayStatus } from '../days';

const STATUS: Record<
  DayStatus,
  { label: string; variant: BadgeVariants['variant']; badgeClass?: string }
> = {
  done: { label: 'Publié', variant: 'default' },
  today: { label: "Aujourd'hui", variant: 'default', badgeClass: 'bg-peach text-deep-night' },
  upcoming: { label: 'À venir', variant: 'outline' },
  missed: { label: 'Passé', variant: 'ghost' },
};

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, NgTemplateOutlet, HlmCardImports, HlmBadgeImports],
  templateUrl: './home.html',
})
export default class Home {
  protected readonly pad = padDay;

  protected readonly days = DAYS.map((day) => {
    const status = dayStatus(day);
    return { ...day, status, ...STATUS[status] };
  });

  protected readonly doneCount = this.days.filter((d) => d.status === 'done').length;
}
