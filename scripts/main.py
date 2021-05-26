# This is a sample Python script.

# Press Shift+F10 to execute it or replace it with your code.
# Press Double Shift to search everywhere for classes, files, tool windows, actions, and settings.
import sys
sys.path.append("python3.8/site-packages")

from open_spiel.python.algorithms import minimax
import pyspiel


def main(n):
    game = pyspiel.load_game("chess")
    state = game.new_initial_state()
    # Print the initial state
    print('Current state: '+str(state))
    if not state.is_terminal():
        outcomes = state.legal_actions()
        print(str(state.action_to_string(state.current_player(), outcomes[6])))
        print("Searching for action...")
        _, action = minimax.alpha_beta_search(game, state=state, value_function=lambda x: 0, maximum_depth=n)
        print('Action chosen: '+state.action_to_string(state.current_player(), action))
        state.apply_action(action)
        print('New state: '+str(state))
    else:
        return None
    return action
    

if __name__ == "__main__":
    action = main(7)
    print(action)
