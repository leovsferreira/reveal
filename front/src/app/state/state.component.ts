import { Component, OnInit, EventEmitter, Output } from '@angular/core';
import { StateService } from '../shared/services/state.service';
import { ApiError, describeError } from '../shared/services/user-data-api.service';
import { SavedState, StateMeta } from '../shared/models/state';
import { NgxSpinnerService } from "ngx-spinner";

@Component({
  selector: 'app-state',
  templateUrl: './state.component.html',
  styleUrls: ['./state.component.css']
})
export class StateComponent implements OnInit {

  public savedStates: StateMeta[] = [];
  public lastRightClick: number = -1;
  public currentStateId: number | null = null;
  public busy = false;

  @Output() changeStateStatus = new EventEmitter<SavedState>();
  constructor(public stateService: StateService, private spinner: NgxSpinnerService) { }

  ngOnInit(): void {
  }

  setList(list: StateMeta[]) {
    this.savedStates = [...list].sort((a, b) => a.id - b.id);
  }

  // saving under an existing name overwrites that state (matched by id, never by name on the server);
  // the graph on screen is left as it is
  async save(stateName: string, forceGraphData: { nodes: any[]; links: any[] }): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.spinner.show();
    try {
      const existing = this.savedStates.find(s => s.name === stateName);
      let meta: StateMeta | null = null;
      if (existing) {
        try {
          meta = await this.stateService.replace(existing.id, forceGraphData);
        } catch (e) {
          // deleted elsewhere: forget it and create it again below
          if (!(e instanceof ApiError && e.status === 404)) throw e;
          this.savedStates = this.savedStates.filter(s => s.id !== existing.id);
        }
      }
      if (!meta) {
        try {
          meta = await this.stateService.create(stateName, forceGraphData);
        } catch (e) {
          // the list was stale: overwrite the state the server already has under that name
          if (!(e instanceof ApiError && e.code === 'name_exists' && e.body?.existing)) throw e;
          meta = await this.stateService.replace(e.body.existing.id, forceGraphData);
        }
      }
      this.upsert(meta);
      this.currentStateId = meta.id;
      return true;
    } catch (e) {
      alert(`Saving the state failed: ${describeError(e)}`);
      return false;
    } finally {
      this.busy = false;
      this.spinner.hide();
    }
  }

  async openState(stateId: number) {
    if (this.busy) return;
    this.busy = true;
    this.spinner.show();
    let state: SavedState;
    try {
      state = await this.stateService.load(stateId);
    } catch (e) {
      alert(`Opening the state failed: ${describeError(e)}`);
      return;
    } finally {
      // hidden before the emit: rebuilding the views shows its own spinner
      this.busy = false;
      this.spinner.hide();
    }
    this.currentStateId = stateId;
    this.changeStateStatus.emit(state);
  }

  // the graph on screen is not touched
  async destroyState(stateId: number) {
    if (this.busy) return;
    if (!confirm("Do you want to exclude this state?")) return;
    this.busy = true;
    this.spinner.show();
    try {
      try {
        await this.stateService.remove(stateId);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
      this.savedStates = this.savedStates.filter(s => s.id !== stateId);
      if (this.currentStateId === stateId) this.currentStateId = null;
    } catch (e) {
      alert(`Deleting the state failed: ${describeError(e)}`);
    } finally {
      this.busy = false;
      this.spinner.hide();
    }
  }

  private upsert(meta: StateMeta) {
    const i = this.savedStates.findIndex(s => s.id === meta.id);
    this.savedStates = i === -1
      ? [...this.savedStates, meta]
      : this.savedStates.map(s => (s.id === meta.id ? meta : s));
  }
}
